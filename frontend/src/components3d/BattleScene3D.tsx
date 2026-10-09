/**
 * BattleScene3D.tsx - 3D场景容器组件
 * 整合 VehicleModel、BallisticTrail、HitEffects
 * 使用 <Canvas> 作为根容器，支持 OrbitControls
 *
 * 悬停引导线：hover 分区时从摄像头位置渲染黄色虚线到分区（useFrame 每帧跟随摄像头）
 * 摄像头起点：开火时炮弹从摄像头位置飞出（替代固定 Z 轴生成点）
 */
import { useState, useCallback, useMemo, useEffect, useRef, forwardRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stats, ContactShadows, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { VehicleDef3D, CameraMode } from '../data/types3d';
import type { PenetrationResult3D } from '../lib/penetration';
import type { Vector3 } from '../lib/ballistics';
import { useBattleStore } from '../store/battleStore';
import VehicleModel, { type ZoneHitInfo } from './VehicleModel';
import BallisticTrail from './BallisticTrail';
import HitEffects, {
  SpecialEventEffects,
  type HitEffectItem,
  type SpecialEventEffectItem,
} from './HitEffects';

// ─── Props ───
export interface BattleScene3DProps {
  vehicle: VehicleDef3D;
  trajectory?: Vector3[];
  straightTrajectory?: Vector3[]; // 直线轨迹（与 trajectory 互斥，优先使用）
  hitResults?: PenetrationResult3D[];
  zoneDamage?: Record<string, number>;
  onZoneClick?: (zoneId: string, hitInfo?: ZoneHitInfo) => void;
  onCameraPositionChange?: (pos: Vector3) => void; // 摄像头位置变化时回调
  onMuzzlePosChange?: (pos: Vector3) => void; // 炮口位置变化时回调（相机局部偏移 (0,-0.3,-1.5)，与 GuideLine 起点一致）
  tracerColor?: string;
  cameraMode?: CameraMode;
  showStats?: boolean; // 显示性能统计
  replayToken?: number; // 回放触发令牌，变化时重置弹道动画
  enableProjectileBreak?: boolean; // 炮弹到达终点时是否破裂
  className?: string;
  style?: React.CSSProperties;
}

// ─── 地面网格 ───
function GroundGrid() {
  return (
    <group>
      <gridHelper args={[30, 30, '#444455', '#333344']} position={[0, -1.5, 0]} />
      {/* 地面平面（微弱反射） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.51, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial
          color="#2a2a30"
          roughness={0.95}
          metalness={0.05}
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}

// ─── 光照 ───
function SceneLighting() {
  return (
    <>
      {/* 环境光：基础照明，提升整体亮度 */}
      <ambientLight intensity={0.8} color="#b0c4de" />

      {/* 主光源：模拟太阳光，暖白色 */}
      <directionalLight position={[10, 10, 5]} intensity={1.2} color="#fff5e6" castShadow={false} />

      {/* 补光：减少阴影死区 */}
      <pointLight position={[-5, 5, -5]} intensity={0.6} color="#ffffff" />

      {/* 副方向光：保持轮廓层次 */}
      <directionalLight position={[-3, 4, 5]} intensity={0.4} color="#aabbcc" />

      {/* 半球光：模拟天光与地面反射 */}
      <hemisphereLight args={['#87ceeb', '#4a5568', 0.4]} />

      {/* 底部补光：保留微弱底光 */}
      <pointLight position={[0, -2, 0]} intensity={0.15} color="#445566" distance={10} />

      {/* 背面轮廓光：勾勒载具边缘 */}
      <directionalLight position={[0, 3, -8]} intensity={0.3} color="#6688aa" />

      {/* 顶部柔光：模拟天光漫射 */}
      <pointLight position={[0, 8, 0]} intensity={0.25} color="#aaccdd" distance={20} />
    </>
  );
}

// ─── 生成命中效果ID ───
let effectIdCounter = 0;
function generateEffectId(): string {
  return `hit_effect_${++effectIdCounter}`;
}

// ─── 悬停引导线（useFrame 实时更新，摄像头拖动时首点跟随）───
function GuideLine({
  targetPos,
  visible,
}: {
  targetPos: [number, number, number];
  visible: boolean;
}) {
  const lineRef = useRef<any>(null);
  const { camera } = useThree();
  // 复用临时向量，避免每帧分配新 Vector3
  const tempMuzzle = useRef(new THREE.Vector3());

  useFrame(() => {
    const line = lineRef.current;
    if (!line || !visible) return;
    // 模拟炮口：相机局部系 (0, -0.3, -1.5)——前方1.5m、下方0.3m，偏离中心射线使线段透视可见
    // （起点在 eye→target 射线上时，透视投影下整条线退化为单像素点，与前移距离无关）
    camera.updateMatrixWorld(); // 确保相机移动/旋转后取到最新 matrixWorld
    const muzzle = camera.localToWorld(tempMuzzle.current.set(0, -0.3, -1.5));
    line.geometry.setPositions([
      muzzle.x,
      muzzle.y,
      muzzle.z,
      targetPos[0],
      targetPos[1],
      targetPos[2],
    ]);
    line.computeLineDistances();
  });

  return (
    <Line
      ref={lineRef}
      points={
        [
          [0, 0, 0],
          [0, 0, 1],
        ] as any
      }
      color="#ffaa00"
      lineWidth={2}
      dashed={true}
      dashSize={0.5}
      gapSize={0.08}
      transparent
      opacity={0.6}
      visible={visible}
    />
  );
}

// ─── 场景内容（在 Canvas 内部，可使用 R3F hooks）───
interface SceneContentProps {
  vehicle: VehicleDef3D;
  trajectory: Vector3[];
  straightTrajectory?: Vector3[];
  hitResults: PenetrationResult3D[];
  zoneDamage: Record<string, number>;
  tracerColor: string;
  showStats: boolean;
  replayToken: number;
  enableProjectileBreak: boolean;
  onZoneClickExternal?: (zoneId: string, hitInfo?: ZoneHitInfo) => void;
  onHoveredZonePosChange: (pos: [number, number, number] | null) => void;
  onZoneClickInternal?: (zoneId: string) => void;
  onZoneIdChange?: (zoneId: string | null) => void;
  onCameraPositionChange?: (pos: Vector3) => void;
  onMuzzlePosChange?: (pos: Vector3) => void;
}

const SceneContent = forwardRef<THREE.Camera, SceneContentProps>(function SceneContent(
  {
    vehicle,
    trajectory,
    straightTrajectory,
    hitResults,
    zoneDamage,
    tracerColor,
    showStats,
    replayToken,
    enableProjectileBreak,
    onZoneClickExternal,
    onHoveredZonePosChange,
    onZoneClickInternal,
    onZoneIdChange,
    onCameraPositionChange,
    onMuzzlePosChange,
  },
  cameraRef,
) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const camera = useThree((state) => state.camera);
  const replaySpeed = useBattleStore((s) => s.replaySpeed);
  const chainEvents = useBattleStore((s) => s.chainEvents);

  // 摄像头位置实时追踪（OrbitControls 会改变摄像头位置）
  const cameraPosRef = useRef(new THREE.Vector3());
  // 炮口临时向量复用（避免每帧分配新 Vector3）
  const tempMuzzleVec = useRef(new THREE.Vector3());
  useFrame(() => {
    cameraPosRef.current.copy(camera.position);
    // 通知父组件摄像头位置变化（每帧更新）
    onCameraPositionChange?.({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
    // 炮口位置：相机局部系 (0, -0.3, -1.5)（与 GuideLine 起点一致），
    // 供父组件开火时统一弹道起点（起点在 eye→target 射线上会透视退化成不可见的竖棒）
    camera.updateMatrixWorld();
    const muzzle = camera.localToWorld(tempMuzzleVec.current.set(0, -0.3, -1.5));
    onMuzzlePosChange?.({ x: muzzle.x, y: muzzle.y, z: muzzle.z });
  });

  // 暴露 camera ref 给父组件
  useEffect(() => {
    if (cameraRef && 'current' in cameraRef) {
      (cameraRef as React.MutableRefObject<THREE.Camera>).current = camera;
    }
  }, [camera, cameraRef]);

  // 引导线目标位置（分区世界坐标）
  const [hoveredZoneWorldPos, setHoveredZoneWorldPos] = useState<[number, number, number] | null>(
    null,
  );
  // 引导线延迟清除定时器：hover out 后延迟约 150ms 再隐藏，避免鼠标快速滑过分区边界时闪烁断裂
  const hideGuideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 组件卸载时清理延迟清除定时器
  useEffect(() => {
    return () => {
      if (hideGuideTimerRef.current !== null) {
        clearTimeout(hideGuideTimerRef.current);
        hideGuideTimerRef.current = null;
      }
    };
  }, []);

  // 命中效果列表
  const [hitEffects, setHitEffects] = useState<HitEffectItem[]>([]);
  const [specialEffects, setSpecialEffects] = useState<SpecialEventEffectItem[]>([]);

  // 当有新的命中结果时，添加效果
  const prevHitCount = useRef(0);
  useEffect(() => {
    if (hitResults.length > prevHitCount.current) {
      const newResults = hitResults.slice(prevHitCount.current);
      const newEffects: HitEffectItem[] = newResults.map((result) => ({
        id: generateEffectId(),
        result,
        position: result.impactPoint3D,
      }));
      setHitEffects((prev) => [...prev, ...newEffects]);
      prevHitCount.current = hitResults.length;
    }
  }, [hitResults]);

  const handleZoneClick = useCallback(
    (zoneId: string, hitInfo?: ZoneHitInfo) => {
      setSelectedZoneId(zoneId);
      // 点击开火：立即同步清除引导线（取消延迟清除定时器），保留“开火后隐藏引导线”语义
      if (hideGuideTimerRef.current !== null) {
        clearTimeout(hideGuideTimerRef.current);
        hideGuideTimerRef.current = null;
      }
      setHoveredZoneWorldPos(null);
      onZoneClickExternal?.(zoneId, hitInfo);
      onZoneIdChange?.(zoneId);
      onZoneClickInternal?.(zoneId);
    },
    [onZoneClickExternal, onZoneClickInternal, onZoneIdChange],
  );

  const handleZoneHover = useCallback(
    (zoneId: string | null) => {
      onZoneIdChange?.(zoneId);
    },
    [onZoneIdChange],
  );

  const handleWorldPosHover = useCallback(
    (worldPos: [number, number, number] | null) => {
      // 悬停引导线延迟清除：非 null 时取消定时器并立即更新；null 时延迟 150ms 再隐藏
      if (hideGuideTimerRef.current !== null) {
        clearTimeout(hideGuideTimerRef.current);
        hideGuideTimerRef.current = null;
      }
      if (worldPos !== null) {
        setHoveredZoneWorldPos(worldPos);
      } else {
        hideGuideTimerRef.current = setTimeout(() => {
          hideGuideTimerRef.current = null;
          setHoveredZoneWorldPos(null);
        }, 150);
      }
      // 外部回调保持同步直传
      onHoveredZonePosChange(worldPos);
    },
    [onHoveredZonePosChange],
  );

  const handleEffectComplete = useCallback((id: string) => {
    setHitEffects((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleSpecialComplete = useCallback((id: string) => {
    setSpecialEffects((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // 炮弹命中回调
  const handleProjectileImpact = useCallback(() => {
    if (hitResults.length === 0) return;
    const lastResult = hitResults[hitResults.length - 1];
    const newEffect: HitEffectItem = {
      id: generateEffectId(),
      result: lastResult,
      position: lastResult.impactPoint3D,
    };
    setHitEffects((prev) => [...prev, newEffect]);
  }, [hitResults]);

  // 当 chainEvents 变化时，生成特殊事件效果
  const prevChainCount = useRef(0);
  useEffect(() => {
    if (chainEvents.length > prevChainCount.current) {
      const newEvents = chainEvents.slice(prevChainCount.current);
      const newSpecial: SpecialEventEffectItem[] = newEvents.map((event, i) => ({
        id: `special_${Date.now()}_${i}`,
        event,
      }));
      setSpecialEffects((prev) => [...prev, ...newSpecial]);
      prevChainCount.current = chainEvents.length;
    }
  }, [chainEvents]);

  // 计算实际渲染的轨迹
  const effectiveTrajectory = useMemo(() => {
    // 直线轨迹：所有点均为 Three.js 场景坐标（摄像头位置、分区 collision.position）
    // 统一置换 (x,y,z)→(z,x,y)，经 BallisticTrail 的 vec3ToTuple [v.y, v.z, v.x] 还原后输出真实场景坐标
    // 首点为开火瞬间的摄像头位置（由 BattleArena 在生成时固化为 shotOrigin）
    if (straightTrajectory && straightTrajectory.length >= 2) {
      return straightTrajectory.map((p) => ({ x: p.z, y: p.x, z: p.y }));
    }

    // 抛物线轨迹：弹道坐标系，保持原逻辑（仅替换第一个点为摄像头位置）
    const base = trajectory;
    if (base.length < 2) return base;

    const cx = cameraPosRef.current.x;
    const cy = cameraPosRef.current.y;
    const cz = cameraPosRef.current.z;

    // 用摄像头 Three.js 坐标替换第一个点
    // BallisticTrail 的 vec3ToTuple: [v.y+offset[0], v.z+offset[1], v.x+offset[2]]
    // 设 v.y=cx, v.z=cy, v.x=cz → 渲染位置 = [cx, cy, cz] = 摄像头位置
    const overridden: Vector3[] = [{ x: cz, y: cx, z: cy }, ...base.slice(1)];
    return overridden;
  }, [straightTrajectory, trajectory]);

  return (
    <>
      <color attach="background" args={['#2a3545']} />
      <fog attach="fog" args={['#2a3545', 18, 45]} />

      <SceneLighting />
      <GroundGrid />

      {/* 载具底部接触阴影 */}
      <ContactShadows
        position={[0, -1.5, 0]}
        opacity={0.4}
        scale={20}
        blur={2}
        far={4}
        color="#000000"
      />

      {/* 引导线：从炮口到 hover 分区（黄色虚线，useFrame 实时跟随摄像头拖动）
          常驻挂载 + visible 切换，避免每次 hover in/out mount/unmount 导致整条线闪烁断裂 */}
      <GuideLine
        targetPos={hoveredZoneWorldPos ?? [0, 0, 0]}
        visible={hoveredZoneWorldPos !== null}
      />

      {/* 载具模型 */}
      <VehicleModel
        vehicle={vehicle}
        zoneDamage={zoneDamage}
        selectedZoneId={selectedZoneId}
        onZoneClick={handleZoneClick}
        onZoneHover={handleZoneHover}
        onWorldPosHover={handleWorldPosHover}
      />

      {/* 弹道轨迹（replayToken 作为 key 强制重置动画） */}
      {effectiveTrajectory.length >= 2 && (
        <BallisticTrail
          key={`trail-${replayToken}`}
          points={effectiveTrajectory}
          color={tracerColor}
          offset={straightTrajectory ? [0, 0, 0] : [0, 2.0, 0]}
          speedMultiplier={replaySpeed}
          breakOnImpact={enableProjectileBreak}
          onProjectileImpact={handleProjectileImpact}
        />
      )}

      {/* 命中效果 */}
      <HitEffects effects={hitEffects} onEffectComplete={handleEffectComplete} />

      {/* 特殊事件效果 */}
      <SpecialEventEffects events={specialEffects} onEffectComplete={handleSpecialComplete} />

      {/* 轨道控制器 */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={2}
        maxDistance={25}
        maxPolarAngle={Math.PI * 0.85}
        target={[0, 0, 0]}
      />

      {/* 性能统计（可选） */}
      {showStats && <Stats />}
    </>
  );
});

// ─── 主组件（Canvas 外部包装）───
export default function BattleScene3D({
  vehicle,
  trajectory = [],
  straightTrajectory,
  hitResults = [],
  zoneDamage = {},
  onZoneClick,
  onCameraPositionChange,
  onMuzzlePosChange,
  tracerColor = '#ffaa00',
  cameraMode = 'free',
  showStats = false,
  replayToken = 0,
  enableProjectileBreak = false,
  className,
  style,
}: BattleScene3DProps) {
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const cameraRef = useRef<THREE.Camera>(null);

  // 相机初始位置
  const cameraPosition = useMemo((): [number, number, number] => {
    switch (cameraMode) {
      case 'follow_trajectory':
        return [0, 5, -10];
      case 'focus_hit':
        return [3, 2, 3];
      case 'free':
      default:
        return [6, 4, 8];
    }
  }, [cameraMode]);

  // 引导线位置变化时同步 hoveredZoneId（通过 SceneContent 回调）
  const handleHoveredZonePosChange = useCallback((pos: [number, number, number] | null) => {
    if (!pos) setHoveredZoneId(null);
  }, []);

  // 悬停分区 ID 同步（useCallback 稳定引用：内联箭头函数每次渲染产生新引用，
  // 会使 VehicleModel 内 ZoneMesh 的 memo 失效，pointermove 期间每帧触发全子树 reconciliation）
  const handleZoneIdChange = useCallback((id: string | null) => {
    setHoveredZoneId(id);
  }, []);

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '600px',
        background: '#1e2d3d',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      <Canvas
        style={{ overflow: 'hidden', width: '100%', height: '100%' }}
        camera={{
          position: cameraPosition,
          fov: 50,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.3,
        }}
        dpr={[1, 1.5]} // 限制像素比，低性能模式
      >
        <SceneContent
          vehicle={vehicle}
          trajectory={trajectory}
          straightTrajectory={straightTrajectory}
          hitResults={hitResults}
          zoneDamage={zoneDamage}
          tracerColor={tracerColor}
          showStats={showStats}
          replayToken={replayToken}
          enableProjectileBreak={enableProjectileBreak}
          onZoneClickExternal={onZoneClick}
          onHoveredZonePosChange={handleHoveredZonePosChange}
          onZoneIdChange={handleZoneIdChange}
          onCameraPositionChange={onCameraPositionChange}
          onMuzzlePosChange={onMuzzlePosChange}
          ref={cameraRef}
        />
      </Canvas>

      {/* Hover 信息覆盖层 */}
      {hoveredZoneId && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            color: '#aabbcc',
            fontSize: '12px',
            fontFamily: 'monospace',
            background: 'rgba(0,0,0,0.6)',
            padding: '4px 8px',
            borderRadius: '4px',
            pointerEvents: 'none',
          }}
        >
          分区: {hoveredZoneId}
          {zoneDamage[hoveredZoneId] !== undefined && ` | 伤害: ${zoneDamage[hoveredZoneId]}%`}
        </div>
      )}
    </div>
  );
}

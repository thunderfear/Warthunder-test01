/**
 * VehicleModel.tsx - 3D载具渲染组件
 * 使用基础几何体（Box/Sphere）构建载具模型，每个分区独立mesh
 * 支持Raycaster拾取、hover高亮、GLB模型导入（可选）
 */
import React, { useRef, useState, useCallback, useMemo, Suspense } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { VehicleDef3D, Zone3DDef, Zone3D } from '../data/types3d';
import { mirrorZone3D } from '../data/vehicle3d';
import { useBattleStore } from '../store/battleStore';

// ─── 共享 Geometry（只创建一次，所有分区复用） ───
const SHARED_GEOMETRIES = {
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  unitSphere: new THREE.SphereGeometry(1, 16, 12),
};

// ─── 颜色状态（四态）───
type ZoneHealthState = 'healthy' | 'yellow' | 'orange' | 'destroyed';

function getHealthState(health: number, damage: number): ZoneHealthState {
  const pct = (damage / health) * 100;
  if (pct >= 100) return 'destroyed';
  if (pct >= 60) return 'orange';
  if (pct >= 25) return 'yellow';
  return 'healthy';
}

function getStateColor(baseColor: string, state: ZoneHealthState): string {
  switch (state) {
    case 'destroyed':
      return '#ff4d4d';
    case 'orange':
      return '#ff9a3c';
    case 'yellow':
      return '#f5d142';
    case 'healthy':
      return baseColor;
  }
}

// 判断分区是否处于起火状态
function isZoneOnFire(zoneId: string, vehicleState: string): boolean {
  switch (vehicleState) {
    case 'engine_fire':
      return zoneId === 'engine';
    case 'fuel_fire':
      return zoneId === 'fuel';
    case 'ammo_cookoff':
      return zoneId === 'ammo';
    default:
      return false;
  }
}

// ─── 3D 命中信息（由 R3F 拾取事件提取，随点击回调透传）───
export interface ZoneHitInfo {
  point: [number, number, number]; // 世界坐标系真实命中点
  normal: [number, number, number]; // 世界坐标系面法线（单位向量，经 normalMatrix 变换）
}

// ─── Props ───
export interface VehicleModelProps {
  vehicle: VehicleDef3D;
  zoneDamage?: Record<string, number>; // 各分区累计伤害
  selectedZoneId?: string | null; // 当前选中分区
  onZoneClick?: (zoneId: string, hitInfo?: ZoneHitInfo) => void;
  onZoneHover?: (zoneId: string | null) => void;
  onWorldPosHover?: (worldPos: [number, number, number] | null) => void;
  modelUrl?: string; // 可选 GLB 模型路径
  visible?: boolean;
}

// ─── 单个分区 Mesh（React.memo 优化重渲染） ───
interface ZoneMeshProps {
  zone: Zone3DDef;
  healthState: ZoneHealthState;
  isSelected: boolean;
  isOnFire: boolean;
  onClick: (zoneId: string, hitInfo?: ZoneHitInfo) => void;
  onHover: (zoneId: string | null) => void;
  onWorldPosHover?: (worldPos: [number, number, number] | null) => void;
}

const ZoneMesh = React.memo(function ZoneMesh({
  zone,
  healthState,
  isSelected,
  isOnFire,
  onClick,
  onHover,
  onWorldPosHover,
}: ZoneMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const baseColor = zone.color ?? '#5a6e4a';
  const stateColor = getStateColor(baseColor, healthState);

  // 指针滑动追踪：pointermove 仅暂存最新交点（写 ref，零渲染开销），
  // 由下方 useFrame 每帧 flush 上报一次 —— 上报频率与渲染帧率严格对齐（逐帧跟随且不掉帧），
  // 且最新交点总在下帧被消费，不存在节流丢帧/尾部丢弃问题
  const pendingMovePosRef = useRef<[number, number, number] | null>(null);

  // 起火闪烁动画
  const fireColorRef = useRef(new THREE.Color('#ff6600'));
  const fireTargetRef = useRef(new THREE.Color('#ff2200'));
  useFrame(() => {
    // 逐帧 flush 指针交点：引导线终点跟随指针在装甲面上的滑动
    if (pendingMovePosRef.current) {
      onWorldPosHover?.(pendingMovePosRef.current);
      pendingMovePosRef.current = null;
    }
    if (!isOnFire || !meshRef.current) return;
    const mat = meshRef.current.material;
    if (mat && 'color' in mat) {
      const t = (Math.sin(Date.now() * 0.006) + 1) / 2;
      fireColorRef.current.set('#ff6600').lerp(fireTargetRef.current.set('#ff2200'), t);
      (mat as THREE.MeshStandardMaterial).color.copy(fireColorRef.current);
      (mat as THREE.MeshStandardMaterial).emissive.set('#ff4400');
      (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + t * 0.5;
    }
  });

  // 颜色计算
  const color = useMemo(() => {
    if (isOnFire) return '#ff6600'; // 起火时初始颜色，useFrame会覆盖
    if (isSelected) return '#ffffff';
    if (hovered) return lightenColor(stateColor, 0.3);
    return stateColor;
  }, [isSelected, hovered, stateColor, isOnFire]);

  const emissiveColor = useMemo(() => {
    if (isOnFire) return '#ff4400';
    if (isSelected) return '#ff4400';
    if (hovered) return '#332200';
    return baseColor; // 默认使用基色作为微弱自发光
  }, [isSelected, hovered, isOnFire, baseColor]);

  const emissiveIntensity = isOnFire ? 0.5 : isSelected ? 0.6 : hovered ? 0.3 : 0.1;

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      onHover(zone.id);
      if (onWorldPosHover) {
        // 优先使用真实指针交点作为引导线终点（比分区中心更精确）
        if (e.point) {
          onWorldPosHover([e.point.x, e.point.y, e.point.z]);
        } else if (meshRef.current) {
          const wp = new THREE.Vector3();
          meshRef.current.getWorldPosition(wp);
          onWorldPosHover([wp.x, wp.y, wp.z]);
        }
      }
    },
    [zone.id, onHover, onWorldPosHover],
  );

  // 指针在装甲面上滑动时逐帧更新引导线终点：
  // stopPropagation 保证仅最上层（被 hover）分区处理，指针滑过不同分区时终点连续跟随而非跨区跳变；
  // 只暂存交点，不重复调用 onHover/setHovered，避免 pointermove 高频触发分区高亮状态 churn
  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pendingMovePosRef.current = [e.point.x, e.point.y, e.point.z];
  }, []);

  const handlePointerOut = useCallback(() => {
    // 丢弃未 flush 的交点，防止 pointerOut 置空终点后被下一帧 useFrame 用旧交点复活
    pendingMovePosRef.current = null;
    setHovered(false);
    onHover(null);
    onWorldPosHover?.(null);
  }, [onHover, onWorldPosHover]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // 提取真实世界交点与面法线：
      // 面法线经 normalMatrix 变换到世界系（非均匀缩放场景必须走 normalMatrix，不能直接乘 modelMatrix）
      let hitInfo: ZoneHitInfo | undefined;
      if (e.face && e.object) {
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(e.object.matrixWorld);
        const worldNormal = e.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        hitInfo = {
          point: [e.point.x, e.point.y, e.point.z],
          normal: [worldNormal.x, worldNormal.y, worldNormal.z],
        };
      }
      onClick(zone.id, hitInfo);
    },
    [zone.id, onClick],
  );

  const collision = zone.collision;
  const visual = zone.visual ?? collision;

  // mirrorX 分区（双侧装甲/履带）：在 x→-x 镜像处再渲染/碰撞一份；
  // 事件 handler 复用同一组回调，两侧命中/悬停均归因到同一 zone.id
  const collisionBodies = zone.mirrorX ? [collision, mirrorZone3D(collision)] : [collision];
  const visualBodies = zone.mirrorX ? [visual, mirrorZone3D(visual)] : [visual];

  return (
    <group>
      {/* 碰撞体（不可见，用于射线检测；mirrorX 时双侧各一份） */}
      {collisionBodies.map((c, i) => (
        <ZoneGeometry
          key={`c${i}`}
          zone={c}
          visible={false}
          onClick={handleClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
          onPointerMove={handlePointerMove}
        />
      ))}
      {/* 视觉体（可见；mirrorX 时双侧各一份） */}
      {visualBodies.map((v, i) => (
        <ZoneGeometry
          key={`v${i}`}
          zone={v}
          meshRef={i === 0 ? meshRef : undefined}
          visible={true}
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          onClick={handleClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
          onPointerMove={handlePointerMove}
        />
      ))}
    </group>
  );
});

// ─── 几何体渲染 ───
interface ZoneGeometryProps {
  zone: Zone3D;
  meshRef?: React.RefObject<THREE.Mesh>;
  visible: boolean;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  onClick?: (e: any) => void;
  onPointerOver?: (e: any) => void;
  onPointerOut?: () => void;
  onPointerMove?: (e: any) => void;
}

function ZoneGeometry({
  zone,
  meshRef,
  visible,
  color = '#888888',
  emissive = '#000000',
  emissiveIntensity = 0,
  onClick,
  onPointerOver,
  onPointerOut,
  onPointerMove,
}: ZoneGeometryProps) {
  // 使用共享 Geometry，通过 scale 实现尺寸变化，避免重复创建 Geometry
  const geometry = zone.type === 'box' ? SHARED_GEOMETRIES.unitBox : SHARED_GEOMETRIES.unitSphere;

  // 材质参数 memo 化
  const materialProps = useMemo(
    () => ({
      color,
      emissive,
      emissiveIntensity,
      transparent: !visible,
      opacity: visible ? 1 : 0,
      roughness: 0.7,
      metalness: 0.3,
    }),
    [color, emissive, emissiveIntensity, visible],
  );

  if (zone.type === 'box') {
    const [sx, sy, sz] = zone.size;
    const [px, py, pz] = zone.position;
    const rot = zone.rotation
      ? (zone.rotation.map((r) => (r * Math.PI) / 180) as [number, number, number])
      : undefined;
    return (
      <mesh
        ref={meshRef}
        geometry={geometry}
        scale={[sx, sy, sz]}
        position={[px, py, pz]}
        rotation={rot}
        visible={visible}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onPointerMove={onPointerMove}
      >
        <meshStandardMaterial
          color={materialProps.color}
          emissive={materialProps.emissive}
          emissiveIntensity={materialProps.emissiveIntensity}
          transparent={materialProps.transparent}
          opacity={materialProps.opacity}
          roughness={materialProps.roughness}
          metalness={materialProps.metalness}
        />
      </mesh>
    );
  } else {
    // sphere
    const r = zone.radius;
    const [px, py, pz] = zone.position;
    return (
      <mesh
        ref={meshRef}
        geometry={geometry}
        scale={[r, r, r]}
        position={[px, py, pz]}
        visible={visible}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onPointerMove={onPointerMove}
      >
        <meshStandardMaterial
          color={materialProps.color}
          emissive={materialProps.emissive}
          emissiveIntensity={materialProps.emissiveIntensity}
          transparent={materialProps.transparent}
          opacity={materialProps.opacity}
          roughness={materialProps.roughness}
          metalness={materialProps.metalness}
        />
      </mesh>
    );
  }
}

// ─── GLB 模型加载器（可选） ───
function GLBModel({ url, onClick }: { url: string; onClick?: (e: any) => void }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} onClick={onClick} scale={[1, 1, 1]} />;
}

// ─── 主组件 ───
export default function VehicleModel({
  vehicle,
  zoneDamage = {},
  selectedZoneId = null,
  onZoneClick,
  onZoneHover,
  onWorldPosHover,
  modelUrl,
  visible = true,
}: VehicleModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vehicleState = useBattleStore((s) => s.vehicleState);

  // 简单浮动动画
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    }
  });

  const handleZoneClick = useCallback(
    (zoneId: string, hitInfo?: ZoneHitInfo) => {
      onZoneClick?.(zoneId, hitInfo);
    },
    [onZoneClick],
  );

  const handleZoneHover = useCallback(
    (zoneId: string | null) => {
      onZoneHover?.(zoneId);
    },
    [onZoneHover],
  );

  const handleWorldPosHover = useCallback(
    (worldPos: [number, number, number] | null) => {
      onWorldPosHover?.(worldPos);
    },
    [onWorldPosHover],
  );

  const offset = vehicle.modelOffset ?? [0, 0, 0];

  return (
    <group ref={groupRef} position={[offset[0], offset[1], offset[2]]} visible={visible}>
      {modelUrl ? (
        <Suspense
          fallback={
            // 加载中占位：显示所有分区几何体
            vehicle.zones.map((zone) => {
              const health = zone.health;
              const damage = zoneDamage[zone.id] ?? 0;
              const state = getHealthState(health, damage);
              const onFire = isZoneOnFire(zone.id, vehicleState);
              return (
                <ZoneMesh
                  key={zone.id}
                  zone={zone}
                  healthState={state}
                  isSelected={selectedZoneId === zone.id}
                  isOnFire={onFire}
                  onClick={handleZoneClick}
                  onHover={handleZoneHover}
                  onWorldPosHover={handleWorldPosHover}
                />
              );
            })
          }
        >
          <GLBModel url={modelUrl} />
        </Suspense>
      ) : (
        vehicle.zones.map((zone) => {
          const health = zone.health;
          const damage = zoneDamage[zone.id] ?? 0;
          const state = getHealthState(health, damage);
          const onFire = isZoneOnFire(zone.id, vehicleState);
          return (
            <ZoneMesh
              key={zone.id}
              zone={zone}
              healthState={state}
              isSelected={selectedZoneId === zone.id}
              isOnFire={onFire}
              onClick={handleZoneClick}
              onHover={handleZoneHover}
              onWorldPosHover={handleWorldPosHover}
            />
          );
        })
      )}
    </group>
  );
}

// ─── 工具函数 ───
function lightenColor(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.lerp(new THREE.Color('#ffffff'), amount);
  return '#' + color.getHexString();
}

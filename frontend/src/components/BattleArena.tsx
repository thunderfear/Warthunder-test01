import { lazy, Suspense, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBattleStore } from '../store/battleStore';
import { getAmmo } from '../data/ammo';
import { penAt, type PenetrationResult3D } from '../lib/penetration';
import { VEHICLE } from '../data/vehicle';
import { VEHICLE_3D, getZone3D } from '../data/vehicle3d';
import { simulateHit3DStraight, synthSceneTrajectory } from '../lib/HitSimulator';
import type { Vector3 } from '../lib/ballistics';
import type { ZoneHitInfo } from '../components3d/VehicleModel';
import { saveBattle, type BattleDTO, type HitDTO } from '../api/client';
import AmmoSelector from './AmmoSelector';
import VehicleSchematic from './VehicleSchematic';
import HitAnalysisWindow from './HitAnalysisWindow';
import ToastContainer from './ToastContainer';
import ErrorBoundary from './ErrorBoundary';
import { useToast } from './Toast';

const BattleScene3D = lazy(() => import('../components3d/BattleScene3D'));

function Scene3DFallback() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d1117',
        color: '#6f8499',
        fontSize: 13,
      }}
    >
      加载3D场景…
    </div>
  );
}

export default function BattleArena() {
  const navigate = useNavigate();
  const {
    ammoId,
    distance,
    hits,
    current,
    zoneDamage,
    use3DView,
    setAmmo,
    setDistance,
    fireAtZone,
    fireRandom,
    closeAnalysis,
    reset,
  } = useBattleStore();
  const ammo = getAmmo(ammoId);
  const penNow = penAt(ammo, distance);

  // 3D 场景显示轨迹（从最近一次命中派生，均为 Three 场景坐标直线，单一数据源 store.hits）：
  // - 3D 直线命中（coordSpace==='three'，simulateHit3DStraight 产生）：hit.trajectory 本就是
  //   场景坐标直线（起点=开火瞬间炮口位置），直接使用；
  // - 2D 命中（fireAtZone/fireRandom，弹道坐标米制抛物线 x∈[50,2000]）：不能当作场景坐标
  //   渲染（场景仅约 30 单位大、camera far=100，炮弹会飞出场景），改为合成场景内直线
  //   （目标=被命中分区 collision.position，zoneKey 查不到则不显示弹道）。
  // 纯派生替代原 straightTrajectory state：任意开火路径（3D 点击/自动/2D 点击）与
  // 视图切换后显示的均为最近一发的正确弹道，不存在陈旧轨迹（W-c 缺陷随之消除）。
  const lastHit = hits[hits.length - 1];
  const displayTrajectory: Vector3[] | undefined = useMemo(() => {
    if (!lastHit) return undefined;
    if ((lastHit.result as PenetrationResult3D).coordSpace === 'three') {
      return lastHit.trajectory;
    }
    const zone3d = lastHit.zoneKey ? getZone3D(lastHit.zoneKey) : undefined;
    if (!zone3d) return undefined;
    const [tx, ty, tz] = zone3d.collision.position;
    return synthSceneTrajectory({ x: tx, y: ty, z: tz });
  }, [lastHit]);

  // 摄像头实时位置（由 BattleScene3D 通过回调更新）
  const cameraPosRef = useRef<Vector3>({ x: 6, y: 4, z: 8 });
  const handleCameraPositionChange = useCallback((pos: Vector3) => {
    cameraPosRef.current = pos;
  }, []);

  // 炮口实时位置（相机局部偏移 (0,-0.3,-1.5)，由 BattleScene3D 每帧回调更新）
  // 开火起点统一为炮口位置：起点若在相机眼睛位置（距相机 <1m），透视压缩下炮弹会呈现为不可辨的长轴竖棒
  // 默认值 = 初始相机 (6,4,8) + 局部偏移 (0,-0.3,-1.5) 的大致值（首帧回调后即被真实值覆盖）
  const muzzlePosRef = useRef<Vector3>({ x: 6, y: 3.7, z: 6.5 });
  const handleMuzzlePosChange = useCallback((pos: Vector3) => {
    muzzlePosRef.current = pos;
  }, []);

  // 将 hits 转换为 PenetrationResult3D[] 供 3D 场景使用
  // ricochetDirection：3D 直线命中（simulateHit3DStraight）携带真实反弹方向（Three 场景坐标），
  // 透传给 HitEffects 渲染；2D 命中结果无该字段 → null（行为与旧逻辑一致）。
  // coordSpace 由 ...h.result 展开自动透传（仅 3D 直线命中携带 'three'）。
  const hitResults3D: PenetrationResult3D[] = hits
    .filter((h) => h.trajectory && h.trajectory.length > 0)
    .map((h) => {
      const lastPt = h.trajectory![h.trajectory!.length - 1];
      const base = {
        ...h.result,
        impactPoint3D: lastPt,
        normalVector: { x: 0, y: 0, z: 1 },
        trueIncidentAngleDeg: h.result.impactAngleDeg,
        ricochetDirection: (h.result as PenetrationResult3D).ricochetDirection ?? null,
      } as PenetrationResult3D;

      // 直线命中（coordSpace==='three'，simulateHit3DStraight 产生）：现有行为保持不变
      if ((h.result as PenetrationResult3D).coordSpace === 'three') {
        return base;
      }

      // 抛物线命中（2D evaluateHit / randomHit 产生，轨迹为弹道坐标 x∈[150,1500] 米制）：
      // impactPoint3D 不再取弹道坐标轨迹末点（置换后 z=distance 会把特效甩出场景外），
      // 改取目标分区 collision.position（THREE 场景坐标）并打 coordSpace='three'
      //（HitEffects 据此直传不置换，特效落在被命中分区上）
      const zone3d = h.zoneKey ? getZone3D(h.zoneKey) : undefined;
      if (zone3d) {
        const [px, py, pz] = zone3d.collision.position;
        return {
          ...base,
          impactPoint3D: { x: px, y: py, z: pz },
          coordSpace: 'three' as const,
        };
      }

      // 兜底：zoneKey 为空或分区查不到，维持现状（轨迹末点 + 缺省置换）
      return base;
    });

  const [isSaving, setIsSaving] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  async function handleSave() {
    if (hits.length === 0) {
      addToast('info', '至少需要一次命中记录才能保存');
      return;
    }

    setIsSaving(true);

    try {
      const dto: BattleDTO = {
        playerName: '玩家',
        playerVehicle: '我方载具',
        enemyVehicle: VEHICLE.name,
        mapName: '演习场',
        result: hits.some((h) => h.result.crewKilled) ? '击毁' : '交火',
        createdAt: new Date().toISOString(),
        hits: hits.map((h, i): HitDTO => {
          const a = getAmmo(h.ammoId);
          const zone = h.zoneKey ? VEHICLE.zones.find((z) => z.key === h.zoneKey) : null;
          return {
            seq: i + 1,
            timeOffset: i * 1500,
            ammoId: h.ammoId,
            caliber: a.caliber,
            distance: h.distance,
            impactAngle: h.result.impactAngleDeg,
            effectiveThickness: h.result.effectiveThickness,
            shellPen: h.result.shellPen,
            zoneKey: h.zoneKey,
            zoneLabel: zone?.label,
            armorType: zone?.armorType,
            category: zone?.category,
            penetrated: h.result.penetrated,
            ricochet: h.result.ricochet,
            missed: h.result.missed,
            armorNeutralized: h.result.armorNeutralized,
            postPenDamage: h.result.postPenDamage,
            crewKilled: h.result.crewKilled,
            resultText: h.result.resultText,
          };
        }),
      };
      await saveBattle(dto);

      addToast('success', '战斗记录已保存！');

      // 重置（显示轨迹由 hits 派生，hits 清空后自动无弹道）
      reset();
      setTimeout(() => {
        navigate('/hangar');
      }, 500);
    } catch (error) {
      console.error('保存失败:', error);
      addToast('error', '保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  }

  function handleZone3DClick(zoneId: string, hitInfo?: ZoneHitInfo) {
    // 弹药耗尽守卫（与 store fireRandom 的 remainingAmmo<=0 提前返回对称，避免耗弹后仍可点击开火）
    if (useBattleStore.getState().vehicleConfig.remainingAmmo <= 0) {
      addToast('info', '弹药已耗尽');
      return;
    }

    const zone3d = getZone3D(zoneId);
    if (!zone3d) return;

    // 命中点：优先使用点击事件提取的真实世界交点，无则回退到分区碰撞体中心
    const pos = hitInfo?.point ?? zone3d.collision.position;
    const zone3DPos = { x: pos[0], y: pos[1], z: pos[2] };

    // 装甲法线优先级链：点击面法线（hitInfo.normal）→ 分区定义法线（surfaceNormal）→ 无（回退为射击方向反方向，即垂直命中）
    let zoneNormal: Vector3 | undefined;
    if (hitInfo?.normal) {
      zoneNormal = { x: hitInfo.normal[0], y: hitInfo.normal[1], z: hitInfo.normal[2] };
    } else if (zone3d.surfaceNormal) {
      const [nx, ny, nz] = zone3d.surfaceNormal;
      zoneNormal = { x: nx, y: ny, z: nz };
    }

    // 使用炮口位置（相机局部偏移点）作为射击起点，与引导线起点统一，避免透视压缩竖棒
    const shotOrigin = muzzlePosRef.current;

    // 调用直线命中模拟：传入法线、射击起点与被点击分区的真实装甲数据（替代硬编码 100mm）
    // 及分区中文名 nameZh（透传为 armor.label，信息流显示“车体侧装甲受损 xx%”而非“装甲受损 xx%”）
    const simResult = simulateHit3DStraight(ammoId, distance, zone3DPos, zoneNormal, shotOrigin, {
      armor: zone3d.armor,
      armorType: zone3d.armorType,
      nameZh: zone3d.nameZh,
    });

    // 写入 store（显示轨迹由 lastHit 派生：coordSpace='three' 时直用 simResult.trajectory）
    const {
      hits: currentHits,
      zoneDamage: currentZoneDamage,
      vehicleConfig,
    } = useBattleStore.getState();
    const newRemainingAmmo = Math.max(0, vehicleConfig.remainingAmmo - 1);

    // 计算 zoneDamage
    const zone2d = VEHICLE.zones.find((z) => z.key === zoneId) ?? null;
    const key = zone2d ? zone2d.key : null;
    const newZoneDamage = { ...currentZoneDamage };
    if (key && simResult.result.postPenDamage > 0) {
      newZoneDamage[key] = Math.min(
        100,
        (newZoneDamage[key] || 0) + simResult.result.postPenDamage,
      );
    }

    useBattleStore.setState({
      hits: [...currentHits, simResult],
      current: simResult,
      zoneDamage: newZoneDamage,
      replayToken: useBattleStore.getState().replayToken + 1,
      vehicleConfig: { ...vehicleConfig, remainingAmmo: newRemainingAmmo },
    });

    // 后效处理
    if (key && simResult.result.penetrated) {
      useBattleStore.getState().applyPostEffects(simResult.result, key);
    }
  }

  // 重置（显示轨迹由 hits 派生，hits 清空后自动无弹道）
  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  // 自动开火：物理判定走 fireRandom（evaluateHit 按 distance 滑块独立计算穿深/跳弹），
  // 渲染轨迹由上方 displayTrajectory 派生——2D 命中合成场景内直线（目标=刚命中分区的
  // collision.position，生成点=沿目标方位的场景边缘合成射手点约 13 单位），炮弹可见地
  // 从远处飞入、落点在装甲上；视觉与物理解耦，避免米制抛物线（x∈[150,1500]）被视锥
  // 裁剪+雾遮蔽导致"炮弹消失、落点不在装甲上"。
  // 弹药耗尽时 fireRandom 内部提前返回（hits 不变），显示轨迹保持最近一发。
  const handleAutoFire = useCallback(() => {
    fireRandom();
  }, [fireRandom]);

  return (
    <div>
      <div className="panel-title">战斗内 · 击中分析窗口</div>
      <div className="arena">
        <div className="stage">
          {use3DView ? (
            <div className="canvas-container">
              <ErrorBoundary>
                <Suspense fallback={<Scene3DFallback />}>
                  <BattleScene3D
                    vehicle={VEHICLE_3D}
                    straightTrajectory={displayTrajectory}
                    hitResults={hitResults3D}
                    zoneDamage={zoneDamage}
                    onZoneClick={handleZone3DClick}
                    onCameraPositionChange={handleCameraPositionChange}
                    onMuzzlePosChange={handleMuzzlePosChange}
                    enableProjectileBreak
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          ) : (
            <VehicleSchematic
              hits={hits}
              zoneDamage={zoneDamage}
              interactive
              onZoneClick={(z) => fireAtZone(z)}
            />
          )}

          <div
            className="crosshair"
            style={{ left: 16, top: 14, color: 'var(--txt-dim)', fontSize: 12 }}
          >
            点击敌方载具任意部位开火 · 当前弹种穿深 @ {distance}m ≈ {penNow.toFixed(0)}mm
          </div>
        </div>

        <div className="side-col">
          <div className="panel">
            <div className="panel-title">选择弹药</div>
            <AmmoSelector value={ammoId} onChange={setAmmo} />
            <div className="kv" style={{ marginTop: 10 }}>
              <span>后效模型</span>
              <span>{ammo.postPen}</span>
            </div>
            <div className="kv">
              <span>转正角 / 跳弹阈值</span>
              <span>
                {ammo.normalization}° / {ammo.ricochetThreshold}°
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">交战距离</div>
            <input
              className="range"
              type="range"
              min={50}
              max={2000}
              step={50}
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
            />
            <div className="kv">
              <span>距离</span>
              <span>{distance} m</span>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={handleAutoFire}>
                ⚡ 自动开火
              </button>
              <button className="btn" onClick={handleReset}>
                重置
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">战斗信息流（{hits.length}）</div>
            <div className="feed">
              {hits.length === 0 && <div className="muted small">尚未开火</div>}
              {[...hits].reverse().map((h, i) => {
                const cls = h.result.missed
                  ? 'miss'
                  : h.result.armorNeutralized
                    ? 'neu'
                    : h.result.ricochet
                      ? 'ric'
                      : h.result.penetrated
                        ? 'pen'
                        : 'miss';
                return (
                  <div key={i} className={`feed-item ${cls}`}>
                    #{hits.length - i} · {h.distance}m · {h.result.resultText}
                  </div>
                );
              })}
            </div>
            <button
              className="btn btn-primary"
              style={{
                marginTop: 12,
                width: '100%',
                opacity: isSaving ? 0.6 : 1,
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
              disabled={isSaving || hits.length === 0}
              onClick={handleSave}
            >
              {isSaving ? (
                <>
                  <span className="spinner">⏳</span>
                  保存中...
                </>
              ) : (
                '结束战斗并保存到机库'
              )}
            </button>
          </div>
        </div>
      </div>

      {current && <HitAnalysisWindow onClose={closeAnalysis} />}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

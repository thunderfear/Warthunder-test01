import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBattle, updateBattle, type BattleDTO } from '../api/client';
import VehicleSchematic from './VehicleSchematic';
import StatsPanel from './StatsPanel';
import { VEHICLE } from '../data/vehicle';
import { VEHICLE_3D } from '../data/vehicle3d';
import { useBattleStore } from '../store/battleStore';
import type { SimHit } from '../lib/HitSimulator';

const BattleScene3D = lazy(() => import('../components3d/BattleScene3D'));

function Scene3DFallback() {
  return (
    <div style={{
      width: '100%', height: '100%', minHeight: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0d1117', color: '#6f8499', fontSize: 13,
    }}>
      加载3D场景…
    </div>
  );
}

/** 将 BattleDTO 的 hit 转换为 SimHit 兼容格式（无类型强转） */
function toSimHit(h: BattleDTO['hits'][number]): SimHit {
  return {
    ammoId: h.ammoId,
    zoneKey: h.zoneKey,
    distance: h.distance,
    result: {
      distance: h.distance,
      impactAngleDeg: h.impactAngle,
      effectiveThickness: h.effectiveThickness,
      shellPen: h.shellPen,
      penetrated: h.penetrated,
      ricochet: h.ricochet,
      missed: h.missed,
      armorNeutralized: h.armorNeutralized,
      postPenDamage: h.postPenDamage,
      crewKilled: h.crewKilled,
      resultText: h.resultText,
    },
  };
}

export default function BattleReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [battle, setBattle] = useState<BattleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const { use3DView, toggleView } = useBattleStore();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getBattle(id).then((b) => {
      setBattle(b);
      setLoading(false);
    });
  }, [id]);

  const zoneDamage = useMemo(() => {
    const d: Record<string, number> = {};
    battle?.hits.forEach((h) => {
      if (h.zoneKey && h.postPenDamage > 0) {
        d[h.zoneKey] = Math.min(100, (d[h.zoneKey] || 0) + h.postPenDamage);
      }
    });
    return d;
  }, [battle]);

  const lastZone = battle?.hits.length ? battle.hits[battle.hits.length - 1].zoneKey : null;

  // 将 DTO hits 安全转换为 SimHit[]
  const simHits = useMemo(() => {
    if (!battle) return [];
    return battle.hits.map(toSimHit);
  }, [battle]);

  async function changeResult(r: string) {
    if (!battle?.id) return;
    const updated = await updateBattle(battle.id, { result: r });
    if (updated) setBattle(updated);
  }

  if (loading) return <div className="empty">加载中…</div>;
  if (!battle) return <div className="empty">未找到该战斗记录。</div>;

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => navigate('/hangar')}>
          ← 返回机库
        </button>
        <h2 style={{ margin: 0, fontSize: 18 }}>{battle.enemyVehicle}</h2>
        <div className="spacer" />
        <span className="muted small">
          {battle.createdAt ? new Date(battle.createdAt).toLocaleString() : ''} · {battle.mapName}
        </span>
        <select
          className="btn"
          value={battle.result}
          onChange={(e) => changeResult(e.target.value)}
        >
          <option value="击毁">击毁</option>
          <option value="交火">交火</option>
          <option value="失利">失利</option>
        </select>
      </div>

      <div className="arena">
        <div className="stage">
          <button className="view-toggle" onClick={toggleView}>
            {use3DView ? '3D' : '2D'}
          </button>

          {use3DView ? (
            <div className="canvas-container">
              <Suspense fallback={<Scene3DFallback />}>
                <BattleScene3D
                  vehicle={VEHICLE_3D}
                  zoneDamage={zoneDamage}
                />
              </Suspense>
            </div>
          ) : (
            <VehicleSchematic
              hits={simHits}
              zoneDamage={zoneDamage}
              highlightKey={lastZone}
            />
          )}
        </div>

        <div className="side-col">
          <StatsPanel hits={battle.hits} />

          <div className="panel">
            <div className="panel-title">逐发命中时间线（{battle.hits.length}）</div>
            <div className="feed">
              {battle.hits.map((h) => {
                const cls = h.missed ? 'miss' : h.armorNeutralized ? 'neu' : h.ricochet ? 'ric' : h.penetrated ? 'pen' : 'miss';
                return (
                  <div key={h.seq} className={`feed-item ${cls}`}>
                    #{h.seq} · {h.ammoId} · {h.distance}m · {h.resultText}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

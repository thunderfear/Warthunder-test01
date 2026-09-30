import { useMemo } from 'react';
import type { HitDTO } from '../api/client';

export default function StatsPanel({ hits }: { hits: HitDTO[] }) {
  const stats = useMemo(() => {
    const total = hits.length;
    const pen = hits.filter((h) => h.penetrated).length;
    const ric = hits.filter((h) => h.ricochet).length;
    const crew = hits.filter((h) => h.crewKilled).length;
    const avgDist = total ? Math.round(hits.reduce((s, h) => s + h.distance, 0) / total) : 0;

    // 各弹种统计
    const byAmmo: Record<string, { n: number; pen: number; ric: number }> = {};
    hits.forEach((h) => {
      const k = `${h.caliber}mm ${h.ammoId}`;
      byAmmo[k] = byAmmo[k] || { n: 0, pen: 0, ric: 0 };
      byAmmo[k].n++;
      if (h.penetrated) byAmmo[k].pen++;
      if (h.ricochet) byAmmo[k].ric++;
    });

    // 命中部位热力
    const byZone: Record<string, number> = {};
    hits.forEach((h) => {
      if (h.zoneKey) byZone[h.zoneLabel || h.zoneKey] = (byZone[h.zoneLabel || h.zoneKey] || 0) + 1;
    });
    const maxZone = Math.max(1, ...Object.values(byZone));

    return { total, pen, ric, crew, avgDist, byAmmo, byZone, maxZone };
  }, [hits]);

  return (
    <div className="panel">
      <div className="panel-title">聚合统计</div>
      <div className="stat-grid">
        <div className="stat-box">
          <div className="num">{stats.total}</div>
          <div className="lbl">总发数</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--green)' }}>{stats.pen}</div>
          <div className="lbl">击穿</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--yellow)' }}>{stats.ric}</div>
          <div className="lbl">跳弹</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--red)' }}>{stats.crew}</div>
          <div className="lbl">击杀乘员</div>
        </div>
        <div className="stat-box">
          <div className="num">{stats.avgDist}</div>
          <div className="lbl">平均交战距离(m)</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="small muted" style={{ marginBottom: 6 }}>各弹种击穿率</div>
        {Object.entries(stats.byAmmo).map(([k, v]) => (
          <div key={k} style={{ marginBottom: 6 }}>
            <div className="kv" style={{ border: 'none', padding: 0 }}>
              <span>{k}</span>
              <span>
                {v.pen}/{v.n} 击穿 · {v.ric} 跳弹
              </span>
            </div>
            <div className="bar">
              <span style={{ width: `${(v.pen / v.n) * 100}%`, background: 'var(--green)' }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="small muted" style={{ marginBottom: 6 }}>命中部位热力</div>
        {Object.entries(stats.byZone)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => (
            <div key={k} style={{ marginBottom: 5 }}>
              <div className="kv" style={{ border: 'none', padding: 0 }}>
                <span>{k}</span>
                <span>{v} 次</span>
              </div>
              <div className="bar">
                <span style={{ width: `${(v / stats.maxZone) * 100}%`, background: 'var(--amber)' }} />
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

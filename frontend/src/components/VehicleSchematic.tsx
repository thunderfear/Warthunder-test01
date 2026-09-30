/**
 * @deprecated 此组件已被 BattleScene3D 替代，保留作为2D降级路径。
 * 新代码请使用 BattleScene3D 组件（frontend/src/components3d/BattleScene3D.tsx）。
 */
import { useRef } from 'react';
import { VEHICLE, zoneAtPoint, type Zone } from '../data/vehicle';
import type { SimHit } from '../lib/HitSimulator';

interface ReplayState {
  token: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface Props {
  hits?: SimHit[];
  highlightKey?: string | null;
  zoneDamage?: Record<string, number>;
  interactive?: boolean;
  onZoneClick?: (zone: Zone) => void;
  replay?: ReplayState | null;
}

function damageColor(d: number): string {
  if (d >= 100) return '#ff4d4d';
  if (d >= 60) return '#ff9a3c';
  if (d >= 25) return '#f5d142';
  return '';
}

export default function VehicleSchematic({
  hits = [],
  highlightKey,
  zoneDamage = {},
  interactive,
  onZoneClick,
  replay,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { w, h } = VEHICLE.viewBox;

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!interactive || !onZoneClick) return;
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    const zone = zoneAtPoint(loc.x, loc.y);
    if (zone) onZoneClick(zone);
  }

  return (
    <svg ref={svgRef} className="tank-svg" viewBox={`0 0 ${w} ${h}`} onClick={handleClick}>
      {/* 车身 / 炮塔轮廓底色 */}
      <rect x={48} y={178} width={544} height={162} rx={12} fill="#0b1622" stroke="#1b2c3e" strokeWidth={2} />
      <rect x={218} y={118} width={274} height={134} rx={10} fill="#0b1622" stroke="#1b2c3e" strokeWidth={2} />

      {VEHICLE.zones.map((z) => {
        const r = z.rect;
        const dmg = zoneDamage[z.key] || 0;
        const isHi = highlightKey === z.key;
        const base = z.category === 'crew' ? '#13283a' : z.category === 'module' ? '#10202e' : '#0e1a26';
        const fill = dmg > 0 ? damageColor(dmg) : base;
        return (
          <g key={z.key}>
            <rect
              className="zone"
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={4}
              fill={fill}
              fillOpacity={dmg > 0 ? 0.3 : 0.85}
              stroke={isHi ? '#34e1e1' : '#26425c'}
              strokeWidth={isHi ? 2.5 : 1.2}
            />
            <text x={z.labelPos.x} y={z.labelPos.y} fontSize={11} fill="#7fa6c4" textAnchor="middle">
              {z.label}
            </text>
          </g>
        );
      })}

      {/* 命中标记 */}
      {hits.filter((hh) => hh.zoneKey).map((hh, i) => {
        const z = VEHICLE.zones.find((zz) => zz.key === hh.zoneKey);
        if (!z) return null;
        const cx = z.rect.x + z.rect.w / 2;
        const cy = z.rect.y + z.rect.h / 2;
        const color = hh.result.penetrated
          ? '#44d27a'
          : hh.result.ricochet
            ? '#f5d142'
            : hh.result.missed
              ? '#6f8499'
              : '#ff4d4d';
        return <circle key={i} className="hit-marker" cx={cx} cy={cy} r={6} fill="none" stroke={color} strokeWidth={2} />;
      })}

      {/* 弹道回放动画 */}
      {replay && (
        <g key={replay.token}>
          <circle r={4} fill="#ffd24d" stroke="#fff" strokeWidth={0.5}>
            <animateMotion dur="0.7s" path={`M ${replay.from.x} ${replay.from.y} L ${replay.to.x} ${replay.to.y}`} fill="freeze" />
          </circle>
          <circle cx={replay.to.x} cy={replay.to.y} r={2} fill="#ff9a3c">
            <animate attributeName="r" from="2" to="28" dur="0.5s" begin="0.7s" fill="freeze" />
            <animate attributeName="opacity" from="0.9" to="0" dur="0.5s" begin="0.7s" fill="freeze" />
          </circle>
        </g>
      )}
    </svg>
  );
}

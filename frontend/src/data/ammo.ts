// 弹药数据模型
// 说明：下列穿深数据基于公开军事资料（二战 88mm 级别火炮）估算，仅供游戏模拟参考，
// 不代表任何真实装备的精确参数。

export type AmmoTypeId = 'AP' | 'APHE' | 'HEAT' | 'APCR' | 'HE';
export type PostPenModel = 'direct' | 'spall' | 'jet' | 'weak' | 'blast';
export type ImpactEffect = 'spark' | 'smoke' | 'flash' | 'none';

export interface PenPoint {
  dist: number; // 距离（米）
  pen: number;  // 在该距离下的穿深（毫米，均质钢等效）
}

export interface Ammo {
  id: AmmoTypeId;
  name: string;
  caliber: number;          // 口径 mm
  muzzleVelocity: number;   // 初速 m/s
  ballisticCoefficient: number; // 弹道系数（越大空气阻力越小、下落越少）
  normalization: number;    // 转正角（°，可“压平”入射角，提升对倾斜装甲效果）
  ricochetThreshold: number;// 跳弹阈值（°，入射角超过则跳弹；HEAT 另算）
  postPen: PostPenModel;    // 后效模型
  penCurve: PenPoint[];     // 穿深随距离数据表（按 dist 升序）
  source: string;
  // ─── 3D 可视化参数（可选） ───
  tracerColor?: string;          // 弹道轨迹颜色（默认 '#ffaa00'）
  explosionRadius?: number;      // 爆炸范围半径（米）
  impactEffect?: ImpactEffect;   // 命中效果类型
}

// 以 88mm 级别火炮为蓝本的典型弹种参数（估算值）
export const AMMO: Ammo[] = [
  {
    id: 'AP',
    name: 'AP 被帽穿甲弹',
    caliber: 88,
    muzzleVelocity: 810,
    ballisticCoefficient: 0.42,
    normalization: 0,
    ricochetThreshold: 70,
    postPen: 'direct',
    penCurve: [
      { dist: 100, pen: 120 },
      { dist: 500, pen: 100 },
      { dist: 1000, pen: 80 },
      { dist: 1500, pen: 64 },
      { dist: 2000, pen: 50 },
    ],
    source: '基于二战 88mm PaK 39 穿甲弹公开资料估算',
    tracerColor: '#ffaa00',
    impactEffect: 'spark',
  },
  {
    id: 'APHE',
    name: 'APHE 榴弹被帽穿甲弹（带装药）',
    caliber: 88,
    muzzleVelocity: 800,
    ballisticCoefficient: 0.41,
    normalization: 3,
    ricochetThreshold: 70,
    postPen: 'spall',
    penCurve: [
      { dist: 100, pen: 115 },
      { dist: 500, pen: 95 },
      { dist: 1000, pen: 76 },
      { dist: 1500, pen: 60 },
      { dist: 2000, pen: 47 },
    ],
    source: '基于二战 88mm PzGr.39 穿甲弹公开资料估算',
    tracerColor: '#ff6600',
    impactEffect: 'flash',
    explosionRadius: 0.5,
  },
  {
    id: 'HEAT',
    name: 'HEAT 破甲弹（成型装药）',
    caliber: 88,
    muzzleVelocity: 600,
    ballisticCoefficient: 0.30,
    normalization: 0,
    ricochetThreshold: 80,
    postPen: 'jet',
    penCurve: [
      { dist: 100, pen: 90 },
      { dist: 500, pen: 90 },
      { dist: 1000, pen: 88 },
      { dist: 1500, pen: 85 },
      { dist: 2000, pen: 82 },
    ],
    source: '基于二战 88mm Gr.39 HL 破甲弹公开资料估算',
    tracerColor: '#ffcc00',
    impactEffect: 'flash',
    explosionRadius: 0.8,
  },
  {
    id: 'APCR',
    name: 'APCR 次口径高速穿甲弹',
    caliber: 88,
    muzzleVelocity: 930,
    ballisticCoefficient: 0.28,
    normalization: 0,
    ricochetThreshold: 70,
    postPen: 'weak',
    penCurve: [
      { dist: 100, pen: 170 },
      { dist: 500, pen: 140 },
      { dist: 1000, pen: 100 },
      { dist: 1500, pen: 70 },
      { dist: 2000, pen: 48 },
    ],
    source: '基于二战 88mm PzGr.40 次口径弹公开资料估算',
    tracerColor: '#ffff00',
    impactEffect: 'spark',
  },
  {
    id: 'HE',
    name: 'HE 高爆榴弹',
    caliber: 88,
    muzzleVelocity: 700,
    ballisticCoefficient: 0.25,
    normalization: 0,
    ricochetThreshold: 999,
    postPen: 'blast',
    penCurve: [
      { dist: 100, pen: 0 },
      { dist: 2000, pen: 0 },
    ],
    source: '高爆弹以爆破与破片杀伤，不依赖击穿',
    tracerColor: '#ff4400',
    impactEffect: 'smoke',
    explosionRadius: 2.0,
  },
];

export function getAmmo(id: AmmoTypeId): Ammo {
  const a = AMMO.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown ammo: ${id}`);
  return a;
}

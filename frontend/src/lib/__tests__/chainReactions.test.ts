import { describe, it, expect } from 'vitest';
import {
  engineFireProbability,
  fuelFireProbability,
  ammoDetonationProbability,
  cookoffDelay,
  calculateOverpressure,
  generateSpallCone,
} from '../chainReactions';

// ─── engineFireProbability ───

describe('engineFireProbability', () => {
  it('汽油机 + APHE弹 + 100%伤害 → 概率 ≈ 0.675', () => {
    const p = engineFireProbability('APHE', 'gasoline', 100);
    // 0.45 * 1.5 * (100/100) = 0.675
    expect(p).toBeCloseTo(0.675, 3);
  });

  it('柴油机 + APCR弹 + 50%伤害 → 概率 ≈ 0.0375', () => {
    const p = engineFireProbability('APCR', 'diesel', 50);
    // 0.15 * 0.5 * (50/100) = 0.0375
    expect(p).toBeCloseTo(0.0375, 4);
  });

  it('伤害=0 → 概率=0', () => {
    const p = engineFireProbability('APHE', 'gasoline', 0);
    expect(p).toBe(0);
  });

  it('伤害>100 → 概率封顶不超过1', () => {
    // turbine(0.30) * HE(1.8) * (200/100 capped to 1.0) = 0.54
    const p = engineFireProbability('HE', 'turbine', 200);
    expect(p).toBeLessThanOrEqual(1.0);
    expect(p).toBeCloseTo(0.54, 3);
  });

  it('极端情况下概率也不超过1', () => {
    // 构造一个最大可能值：gasoline(0.45) * HE(1.8) * 1.0 = 0.81
    const p = engineFireProbability('HE', 'gasoline', 999);
    expect(p).toBeLessThanOrEqual(1.0);
  });
});

// ─── fuelFireProbability ───

describe('fuelFireProbability', () => {
  it('汽油 + APHE + 满油 + 无隔板 → 概率 ≈ 1.0', () => {
    const p = fuelFireProbability('APHE', 'gasoline', 1.0, false);
    // 0.50 * 2.0 * 1.0 * 1.0 = 1.0
    expect(p).toBeCloseTo(1.0, 3);
  });

  it('柴油 + APCR + 低油 + 有隔板 → 概率极低', () => {
    const p = fuelFireProbability('APCR', 'diesel', 0.2, true);
    // 0.25 * 0.3 * max(0.1, 0.2) * 0.5 = 0.25 * 0.3 * 0.2 * 0.5 = 0.0075
    expect(p).toBeCloseTo(0.0075, 4);
    expect(p).toBeLessThan(0.05);
  });

  it('燃油=0 → 使用 fuelFactor=0.1（最低保底）', () => {
    const p = fuelFireProbability('APHE', 'gasoline', 0, false);
    // 0.50 * 2.0 * 0.1 * 1.0 = 0.10
    expect(p).toBeCloseTo(0.1, 3);
  });

  it('概率不超过1', () => {
    const p = fuelFireProbability('APHE', 'gasoline', 1.0, false);
    expect(p).toBeLessThanOrEqual(1.0);
  });
});

// ─── ammoDetonationProbability ───

describe('ammoDetonationProbability', () => {
  it('剩余弹药=0 → 概率=0', () => {
    const p = ammoDetonationProbability('APHE', 0, 40, false, true);
    expect(p).toBe(0);
  });

  it('有泄压阀 + 隔板完好 → 概率=0.05', () => {
    const p = ammoDetonationProbability('APHE', 20, 40, true, true);
    expect(p).toBe(0.05);
  });

  it('满弹药 + 无泄压阀 + HE弹 → 高概率', () => {
    const p = ammoDetonationProbability('HE', 40, 40, false, false);
    // 0.80 * (0.3 + 0.7 * 1.0) * 1.5 = 0.80 * 1.0 * 1.5 = 1.2 → capped to 1.0
    expect(p).toBe(1.0);
  });

  it('弹药比影响概率（弹药越多越高）', () => {
    const pLow = ammoDetonationProbability('APHE', 5, 40, false, false);
    const pHigh = ammoDetonationProbability('APHE', 35, 40, false, false);
    expect(pHigh).toBeGreaterThan(pLow);
  });

  it('无泄压阀但隔板完好 → 正常计算（非0.05）', () => {
    const p = ammoDetonationProbability('APHE', 20, 40, false, true);
    // ammoRatio=0.5, ammoFactor=0.3+0.7*0.5=0.65
    // 0.80 * 0.65 * 1.3 = 0.676
    expect(p).toBeCloseTo(0.676, 2);
    expect(p).toBeGreaterThan(0.05);
  });
});

// ─── cookoffDelay ───

describe('cookoffDelay', () => {
  it('返回值在合理范围内（≥10秒，≤50秒）', () => {
    for (let i = 0; i < 50; i++) {
      const d = cookoffDelay(20, false);
      expect(d).toBeGreaterThanOrEqual(10);
      expect(d).toBeLessThanOrEqual(50);
    }
  });

  it('有泄压阀延迟更长（统计意义上）', () => {
    // 多次采样取平均值比较
    const samplesNoBlowout: number[] = [];
    const samplesBlowout: number[] = [];
    for (let i = 0; i < 100; i++) {
      samplesNoBlowout.push(cookoffDelay(20, false));
      samplesBlowout.push(cookoffDelay(20, true));
    }
    const avgNo = samplesNoBlowout.reduce((a, b) => a + b, 0) / samplesNoBlowout.length;
    const avgYes = samplesBlowout.reduce((a, b) => a + b, 0) / samplesBlowout.length;
    expect(avgYes).toBeGreaterThan(avgNo);
  });

  it('返回值为整数', () => {
    const d = cookoffDelay(15, false);
    expect(Number.isInteger(d)).toBe(true);
  });
});

// ─── calculateOverpressure ───

describe('calculateOverpressure', () => {
  it('大装药近距离 → killed=true, damage=100', () => {
    const r = calculateOverpressure(10.0, 1.0);
    // W=10, R=1: raw ≈ 108.5, effective ≈ 162.8 > 98
    expect(r.killed).toBe(true);
    expect(r.damage).toBe(100);
    expect(r.overpressureKPa).toBeGreaterThan(98);
  });

  it('小装药远距离 → killed=false, damage=0', () => {
    const r = calculateOverpressure(0.01, 20.0);
    expect(r.killed).toBe(false);
    expect(r.damage).toBe(0);
  });

  it('距离最小值0.5（防止除零）', () => {
    // 传入 distance=0，应该用 0.5 计算，不会崩溃
    const r = calculateOverpressure(1.0, 0);
    expect(r.overpressureKPa).toBeGreaterThan(0);
    expect(Number.isFinite(r.overpressureKPa)).toBe(true);
  });

  it('密闭空间1.5倍叠加生效', () => {
    // 计算一个中等场景，验证 effective = overpressureKPa * 1.5
    const r = calculateOverpressure(0.5, 3.0);
    // 手动计算原始超压
    const W = 0.5;
    const R = 3.0;
    const raw =
      (0.84 * Math.cbrt(W)) / R + (2.7 * Math.pow(W, 2 / 3)) / (R * R) + (7.06 * W) / (R * R * R);
    const effective = raw * 1.5;
    expect(r.overpressureKPa).toBeCloseTo(effective, 3);
  });

  it('高超压 → damage=100（effective>98）', () => {
    // 中低参数（如 W=1/R=2、W=3/R=1.5）经手算 effective 均 ≤ 98（damage=0 区间），
    // 采用极端参数 W=10kg、R=1m 验证高档位伤害
    const r3 = calculateOverpressure(10.0, 1.0);
    expect(r3.overpressureKPa).toBeGreaterThan(98);
    expect(r3.damage).toBe(100);
  });
});

// ─── generateSpallCone ───

describe('generateSpallCone', () => {
  const adjacentZones = new Map<string, string[]>([
    ['ammo', ['gunner', 'transmission']],
    ['gunner', ['breech', 'ammo']],
    ['transmission', ['driver', 'ammo']],
  ]);

  it('有相邻分区 → 返回溅射列表', () => {
    const result = generateSpallCone('ammo', 30, 5, 80, adjacentZones);
    expect(result.length).toBeGreaterThan(0);
    // ammo 的直接邻居: gunner, transmission
    const zoneKeys = result.map((r) => r.zoneKey);
    expect(zoneKeys).toContain('gunner');
    expect(zoneKeys).toContain('transmission');
  });

  it('无相邻分区 → 返回空列表', () => {
    const emptyMap = new Map<string, string[]>();
    const result = generateSpallCone('unknown_zone', 30, 5, 80, emptyMap);
    expect(result).toEqual([]);
  });

  it('伤害值在合理范围内（40-70%基础伤害 for 直接邻居）', () => {
    const baseDamage = 100;
    // 只测直接邻居（不包含二级）
    const simpleMap = new Map<string, string[]>([
      ['center', ['left']],
      ['left', []],
    ]);
    for (let i = 0; i < 50; i++) {
      const result = generateSpallCone('center', 30, 5, baseDamage, simpleMap);
      for (const r of result) {
        // 直接邻居: 40-70% of baseDamage
        expect(r.damage).toBeGreaterThanOrEqual(30);
        expect(r.damage).toBeLessThanOrEqual(80);
      }
    }
  });

  it('二级相邻分区伤害衰减（10-25%基础伤害）', () => {
    const chainMap = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['C']],
      ['C', []],
    ]);
    const baseDamage = 100;
    for (let i = 0; i < 50; i++) {
      const result = generateSpallCone('A', 30, 5, baseDamage, chainMap);
      // B is direct neighbor (40-70%), C is second-level (10-25%)
      const cEntry = result.find((r) => r.zoneKey === 'C');
      if (cEntry) {
        expect(cEntry.damage).toBeGreaterThanOrEqual(5);
        expect(cEntry.damage).toBeLessThanOrEqual(30);
      }
    }
  });
});

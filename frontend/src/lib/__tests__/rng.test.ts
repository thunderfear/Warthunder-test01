// RNG 回归测试：可播种随机源的确定性与命中结果可重现性（一期 R1 风险消解的验收证据）
import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { simulateHit } from '../HitSimulator';
import { getAmmo } from '../../data/ammo';
import { VEHICLE } from '../../data/vehicle';

describe('createRng (mulberry32)', () => {
  it('同一 seed 产生相同序列', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('不同 seed 产生不同序列', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('输出稳定在 [0, 1) 区间', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('可重现命中（seeded simulateHit）', () => {
  const ammo = getAmmo('APHE');
  // 选装甲最薄的分区，确保 APHE 在近距离必击穿，使后效策略（含 rng 破片锥）一定被执行
  const thinZone = VEHICLE.zones.reduce((min, z) =>
    z.nominalThickness < min.nominalThickness ? z : min,
  );

  it('同一 seed 两次命中结果深度相等', () => {
    const hit1 = simulateHit(ammo, thinZone, 150, createRng(12345));
    const hit2 = simulateHit(ammo, thinZone, 150, createRng(12345));
    expect(hit1.result).toEqual(hit2.result);
  });

  it('同一 seed 完整 SimHit（含弹道轨迹）深度相等', () => {
    const hit1 = simulateHit(ammo, thinZone, 150, createRng(777));
    const hit2 = simulateHit(ammo, thinZone, 150, createRng(777));
    expect(hit1).toEqual(hit2);
  });

  it('不同 seed 后效破片锥参数不同（证明 rng 已注入策略）', () => {
    const hit1 = simulateHit(ammo, thinZone, 150, createRng(111));
    const hit2 = simulateHit(ammo, thinZone, 150, createRng(99999));
    // 前提：两次都必须已击穿并生成破片锥，否则说明选区/距离不能保证击穿
    expect(hit1.result.penetrated).toBe(true);
    expect(hit1.result.postEffectDetails?.spallCone).toBeDefined();
    expect(hit2.result.postEffectDetails?.spallCone).toBeDefined();
    expect(hit1.result.postEffectDetails?.spallCone).not.toEqual(
      hit2.result.postEffectDetails?.spallCone,
    );
  });
});

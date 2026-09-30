import { describe, it, expect } from 'vitest';
import { computeBallistics, computeBallistics3D } from '../ballistics';

describe('computeBallistics', () => {
  it('下落量随距离增大', () => {
    const near = computeBallistics({ distance: 300, muzzleVelocity: 800, ballisticCoefficient: 0.4 });
    const far = computeBallistics({ distance: 1500, muzzleVelocity: 800, ballisticCoefficient: 0.4 });
    expect(far.drop).toBeGreaterThan(near.drop);
    expect(far.impactAngleDeg).toBeGreaterThan(near.impactAngleDeg);
  });

  it('弹道系数越大，下落越少', () => {
    const lowBc = computeBallistics({ distance: 1000, muzzleVelocity: 800, ballisticCoefficient: 0.25 });
    const highBc = computeBallistics({ distance: 1000, muzzleVelocity: 800, ballisticCoefficient: 0.5 });
    expect(highBc.drop).toBeLessThan(lowBc.drop);
  });

  it('近距入射角很小', () => {
    const r = computeBallistics({ distance: 100, muzzleVelocity: 900, ballisticCoefficient: 0.4 });
    expect(r.impactAngleDeg).toBeLessThan(2);
  });
});

describe('computeBallistics3D', () => {
  it('零距离应返回0下落', () => {
    const r = computeBallistics3D({
      muzzleVelocity: 800,
      caliber: 88,
      ballisticCoefficient: 0.4,
      distance: 0,
      angle: 0,
    });
    expect(r.drop).toBeCloseTo(0, 3);
    expect(r.impactPoint.x).toBeCloseTo(1, 0); // Math.max(1, 0) = 1
  });

  it('标准距离下落量大于0', () => {
    const r = computeBallistics3D({
      muzzleVelocity: 800,
      caliber: 88,
      ballisticCoefficient: 0.4,
      distance: 500,
      angle: 0,
    });
    expect(r.drop).toBeGreaterThan(0);
    expect(r.impactAngleDeg).toBeGreaterThan(0);
    expect(r.timeOfFlight).toBeGreaterThan(0);
  });

  it('最大距离1500m物理合理性', () => {
    const r = computeBallistics3D({
      muzzleVelocity: 800,
      caliber: 88,
      ballisticCoefficient: 0.4,
      distance: 1500,
      angle: 0,
    });
    expect(r.drop).toBeGreaterThan(0);
    expect(r.impactVelocity).toBeGreaterThan(0);
    expect(r.impactVelocity).toBeLessThan(800); // 速度应递减
    expect(r.impactPoint.x).toBe(1500);
  });

  it('极端BC值：高BC下落更少', () => {
    const lowBc = computeBallistics3D({
      muzzleVelocity: 800,
      caliber: 88,
      ballisticCoefficient: 0.25,
      distance: 1000,
      angle: 0,
    });
    const highBc = computeBallistics3D({
      muzzleVelocity: 800,
      caliber: 88,
      ballisticCoefficient: 0.9,
      distance: 1000,
      angle: 0,
    });
    expect(highBc.drop).toBeLessThan(lowBc.drop);
  });

  it('极端入射角度：大角度下落更大', () => {
    const flat = computeBallistics3D({
      muzzleVelocity: 800,
      caliber: 88,
      ballisticCoefficient: 0.4,
      distance: 500,
      angle: 0,
    });
    const steep = computeBallistics3D({
      muzzleVelocity: 800,
      caliber: 88,
      ballisticCoefficient: 0.4,
      distance: 500,
      angle: 30,
    });
    // 大角度射击时水平速度更小，飞行时间更长，下落更大
    expect(steep.drop).toBeGreaterThan(flat.drop);
  });

  it('速度递减：落地速度小于初速', () => {
    const r = computeBallistics3D({
      muzzleVelocity: 900,
      caliber: 88,
      ballisticCoefficient: 0.35,
      distance: 1000,
      angle: 0,
    });
    expect(r.impactVelocity).toBeLessThan(900);
  });

  it('横风产生侧偏', () => {
    const noWind = computeBallistics3D({
      muzzleVelocity: 800,
      caliber: 88,
      ballisticCoefficient: 0.4,
      distance: 500,
      angle: 0,
    });
    const crossWind = computeBallistics3D({
      muzzleVelocity: 800,
      caliber: 88,
      ballisticCoefficient: 0.4,
      distance: 500,
      angle: 0,
      windSpeed: { x: 0, y: 5, z: 0 },
    });
    expect(crossWind.impactPoint.y).toBeGreaterThan(noWind.impactPoint.y);
  });
});

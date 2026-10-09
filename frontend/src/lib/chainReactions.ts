// 连锁反应引擎：状态机 + 概率公式 + 超压计算 + 破片锥
// 纯函数模块，不依赖 React 或 Three.js
import type { Rng } from './rng';

// === 状态机定义 ===
export enum VehicleState {
  NORMAL = 'normal',
  MODULE_DAMAGED = 'module_damaged',
  ENGINE_FIRE = 'engine_fire',
  FUEL_FIRE = 'fuel_fire',
  AMMO_COOKOFF = 'ammo_cookoff',
  AMMO_DETONATED = 'ammo_detonated',
  FUEL_EXPLODED = 'fuel_exploded',
  DESTROYED = 'destroyed',
}

// === 特殊事件类型 ===
export type SpecialEvent =
  | { type: 'engine_stall'; zoneKey: string; severity: 'partial' | 'full' }
  | { type: 'engine_fire'; zoneKey: string; probability: number }
  | { type: 'fuel_fire'; zoneKey: string; probability: number }
  | { type: 'ammo_cookoff'; zoneKey: string; delaySeconds: number }
  | { type: 'ammo_detonation'; zoneKey: string }
  | { type: 'fuel_explosion'; zoneKey: string }
  | { type: 'gun_jam'; zoneKey: string };

// === 后效详情接口 ===
export interface PostEffectDetail {
  spallCone?: SpallCone;
  splashZones?: SplashZone[];
  specialEvents?: SpecialEvent[];
  crewCasualties?: string[];
  overpressureKPa?: number;
}

export interface SpallCone {
  angleDeg: number; // 30~45度
  fragmentCount: number;
  fragments: { zoneKey: string; damage: number }[];
}

export interface SplashZone {
  zoneKey: string;
  damage: number;
  distance: number;
}

// === 概率公式（基于物理研究数据）===

// 发动机起火概率
export function engineFireProbability(
  ammoType: string,
  engineType: 'diesel' | 'gasoline' | 'turbine',
  damage: number,
): number {
  const baseRate: Record<string, number> = { gasoline: 0.45, diesel: 0.15, turbine: 0.3 };
  const ammoMultiplier: Record<string, number> = {
    APHE: 1.5,
    HE: 1.8,
    HEAT: 1.2,
    AP: 0.8,
    APCR: 0.5,
  };
  const damageFactor = Math.min(1.0, damage / 100);
  return Math.min(
    1.0,
    (baseRate[engineType] ?? 0.3) * (ammoMultiplier[ammoType] ?? 1.0) * damageFactor,
  );
}

// 油箱起火概率
export function fuelFireProbability(
  ammoType: string,
  fuelType: 'diesel' | 'gasoline',
  fuelRemaining: number,
  hasFirewall: boolean,
): number {
  const baseRate = fuelType === 'gasoline' ? 0.5 : 0.25;
  const ammoMultiplier: Record<string, number> = {
    APHE: 2.0,
    HE: 1.8,
    HEAT: 1.0,
    AP: 0.6,
    APCR: 0.3,
  };
  const fuelFactor = Math.max(0.1, fuelRemaining);
  const firewallMod = hasFirewall ? 0.5 : 1.0;
  return Math.min(1.0, baseRate * (ammoMultiplier[ammoType] ?? 1.0) * fuelFactor * firewallMod);
}

// 弹药殉爆概率
export function ammoDetonationProbability(
  ammoType: string,
  remainingAmmo: number,
  maxAmmo: number,
  hasBlowoutPanels: boolean,
  compartmentIntact: boolean,
): number {
  if (remainingAmmo === 0) return 0;
  if (hasBlowoutPanels && compartmentIntact) return 0.05;
  const ammoRatio = remainingAmmo / maxAmmo;
  const baseRate = 0.8;
  const ammoFactor = 0.3 + 0.7 * ammoRatio;
  const typeMultiplier: Record<string, number> = {
    APHE: 1.3,
    HE: 1.5,
    HEAT: 1.0,
    AP: 0.7,
    APCR: 0.4,
  };
  return Math.min(1.0, baseRate * ammoFactor * (typeMultiplier[ammoType] ?? 1.0));
}

// 殉爆延迟（参考战雷2021：15~30秒）
export function cookoffDelay(
  remainingAmmo: number,
  hasBlowoutPanels: boolean,
  rng: Rng = Math.random,
): number {
  const base = 15 + rng() * 15;
  const ammoFactor = 1.0 - 0.3 * (remainingAmmo / 40);
  const blowoutMod = hasBlowoutPanels ? 1.5 : 1.0;
  return Math.round(base * ammoFactor * blowoutMod);
}

// Sadovskii超压公式（密闭空间1.5倍叠加）
export function calculateOverpressure(
  tntKg: number,
  distanceM: number,
): { killed: boolean; damage: number; overpressureKPa: number } {
  const W = tntKg;
  const R = Math.max(0.5, distanceM);
  const overpressureKPa =
    (0.84 * Math.cbrt(W)) / R + (2.7 * Math.pow(W, 2 / 3)) / (R * R) + (7.06 * W) / (R * R * R);
  const effective = overpressureKPa * 1.5; // 密闭空间叠加
  if (effective > 98) return { killed: true, damage: 100, overpressureKPa: effective };
  if (effective > 49) return { killed: false, damage: 80, overpressureKPa: effective };
  if (effective > 19.6) return { killed: false, damage: 40, overpressureKPa: effective };
  return { killed: false, damage: 0, overpressureKPa: effective };
}

// 破片锥溅射计算
export function generateSpallCone(
  impactZoneKey: string,
  coneAngleDeg: number,
  fragmentCount: number,
  baseDamage: number,
  adjacentZones: Map<string, string[]>,
  rng: Rng = Math.random,
): { zoneKey: string; damage: number }[] {
  const result: { zoneKey: string; damage: number }[] = [];
  const directNeighbors = adjacentZones.get(impactZoneKey) ?? [];

  // 直接相邻分区：承受主要破片伤害
  for (const zoneKey of directNeighbors) {
    const damage = baseDamage * (0.4 + 0.3 * rng()); // 40-70%基础伤害
    result.push({ zoneKey, damage: Math.round(damage) });
  }

  // 二级相邻分区：衰减伤害
  for (const neighbor of directNeighbors) {
    const secondLevel = adjacentZones.get(neighbor) ?? [];
    for (const zoneKey of secondLevel) {
      if (zoneKey === impactZoneKey || directNeighbors.includes(zoneKey)) continue;
      const damage = baseDamage * (0.1 + 0.15 * rng()); // 10-25%衰减伤害
      result.push({ zoneKey, damage: Math.round(damage) });
    }
  }

  return result;
}

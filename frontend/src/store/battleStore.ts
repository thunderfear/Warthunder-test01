import { create } from 'zustand';
import type { AmmoTypeId } from '../data/ammo';
import { getAmmo } from '../data/ammo';
import type { Zone } from '../data/vehicle';
import { VEHICLE } from '../data/vehicle';
import { simulateHit, randomHit, type SimHit } from '../lib/HitSimulator';
import type { CameraMode } from '../data/types3d';
import type { PenetrationResult } from '../lib/penetration';
import {
  engineFireProbability,
  fuelFireProbability,
  ammoDetonationProbability,
  cookoffDelay,
  calculateOverpressure,
  type SpecialEvent,
  type PostEffectDetail,
} from '../lib/chainReactions';

// ─── 状态优先级常量 ───
const STATE_PRIORITY: Record<string, number> = {
  'normal': 0,
  'module_damaged': 1,
  'engine_fire': 2,
  'fuel_fire': 2,
  'ammo_cookoff': 3,
  'ammo_detonated': 4,
  'fuel_exploded': 4,
  'destroyed': 5,
};

interface VehicleConfig {
  maxAmmo: number;
  remainingAmmo: number;
  hasBlowoutPanels: boolean;
  fuelRemaining: number;
  hasFirewall: boolean;
  engineType: 'diesel' | 'gasoline' | 'turbine';
  fuelType: 'diesel' | 'gasoline';
}

const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  maxAmmo: 40,
  remainingAmmo: 40,
  hasBlowoutPanels: false,
  fuelRemaining: 1.0,
  hasFirewall: false,
  engineType: 'diesel',
  fuelType: 'diesel',
};

interface BattleState {
  ammoId: AmmoTypeId;
  distance: number; // 当前手动开火距离（米）
  hits: SimHit[];
  current: SimHit | null; // 最近一发（用于分析窗口）
  replayToken: number; // 自增以触发回放动画
  zoneDamage: Record<string, number>; // 各分区累计损伤 0–100
  // ─── 3D 场景状态 ───
  replayIndex: number;        // 当前回放帧索引
  cameraMode: CameraMode;     // 相机模式
  replaySpeed: number;        // 回放速度倍率
  use3DView: boolean;         // 是否使用3D视图（默认true）
  // ─── 后效连锁状态 ───
  chainEvents: SpecialEvent[];        // 当前触发的连锁事件列表
  vehicleState: string;               // 当前载具状态
  crewKilled: string[];               // 阵亡乘员名列表
  // ─── 载具配置 ───
  vehicleConfig: VehicleConfig;
  setAmmo: (id: AmmoTypeId) => void;
  setDistance: (d: number) => void;
  fireAtZone: (zone: Zone | null) => void; // 点击载具开火（用当前距离）
  fireRandom: () => void; // 自动开火演示
  closeAnalysis: () => void;
  reset: () => void;
  // ─── 3D 场景 actions ───
  setReplayIndex: (index: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setReplaySpeed: (speed: number) => void;
  toggleView: () => void;  // 切换2D/3D视图
  // ─── 后效处理 ───
  applyPostEffects: (hitResult: PenetrationResult, zoneKey: string) => void;
}

function accumulate(zoneDamage: Record<string, number>, hit: SimHit): Record<string, number> {
  const next = { ...zoneDamage };
  const key = hit.zoneKey;
  if (key && hit.result.postPenDamage > 0) {
    next[key] = Math.min(100, (next[key] || 0) + hit.result.postPenDamage);
  }
  return next;
}

// 辅助：对指定分区施加溅射伤害
function applySplashDamage(
  zoneDamage: Record<string, number>,
  splashZoneKey: string,
  damage: number,
): Record<string, number> {
  const next = { ...zoneDamage };
  if (damage > 0) {
    next[splashZoneKey] = Math.min(100, (next[splashZoneKey] || 0) + damage);
  }
  return next;
}

export const useBattleStore = create<BattleState>((set, get) => ({
  ammoId: 'APHE',
  distance: 600,
  hits: [],
  current: null,
  replayToken: 0,
  zoneDamage: {},
  replayIndex: 0,
  cameraMode: 'free',
  replaySpeed: 1,
  use3DView: true,
  chainEvents: [],
  vehicleState: 'normal',
  crewKilled: [],
  vehicleConfig: { ...DEFAULT_VEHICLE_CONFIG },

  setAmmo: (id) => set({ ammoId: id }),
  setDistance: (d) => set({ distance: Math.max(50, Math.min(2000, Math.round(d))) }),

  fireAtZone: (zone) => {
    const { ammoId, distance, hits, zoneDamage, vehicleConfig } = get();
    // 开火消耗弹药
    const newRemainingAmmo = Math.max(0, vehicleConfig.remainingAmmo - 1);
    const ammo = getAmmo(ammoId);
    const hit = simulateHit(ammo, zone, distance);
    const newZoneDamage = accumulate(zoneDamage, hit);

    set({
      hits: [...hits, hit],
      current: hit,
      zoneDamage: newZoneDamage,
      replayToken: get().replayToken + 1,
      vehicleConfig: { ...vehicleConfig, remainingAmmo: newRemainingAmmo },
    });

    // 命中后处理后效（仅在击穿且存在分区key时）
    if (zone && hit.result.penetrated) {
      get().applyPostEffects(hit.result, zone.key);
    }
  },

  fireRandom: () => {
    const state = get();
    const { ammoId, hits, zoneDamage, vehicleConfig } = state;

    // 检查弹药是否耗尽
    if (vehicleConfig.remainingAmmo <= 0) {
      console.warn('弹药已耗尽');
      return;
    }

    const hit = randomHit(ammoId);
    const newZoneDamage = accumulate(zoneDamage, hit);
    const newRemainingAmmo = Math.max(0, vehicleConfig.remainingAmmo - 1);

    set({
      hits: [...hits, hit],
      current: hit,
      zoneDamage: newZoneDamage,
      replayToken: get().replayToken + 1,
      vehicleConfig: { ...vehicleConfig, remainingAmmo: newRemainingAmmo },
    });

    // 随机命中也处理后效
    if (hit.zoneKey && hit.result.penetrated) {
      get().applyPostEffects(hit.result, hit.zoneKey);
    }
  },

  closeAnalysis: () => set({ current: null, chainEvents: [] }),
  reset: () => set({
    hits: [],
    current: null,
    zoneDamage: {},
    replayToken: get().replayToken + 1,
    replayIndex: 0,
    chainEvents: [],
    vehicleState: 'normal',
    crewKilled: [],
    vehicleConfig: { ...DEFAULT_VEHICLE_CONFIG },
  }),

  setReplayIndex: (index) => set({ replayIndex: index }),
  setCameraMode: (mode) => set({ cameraMode: mode as CameraMode }),
  setReplaySpeed: (speed) => set({ replaySpeed: speed }),
  toggleView: () => set({ use3DView: !get().use3DView }),

  applyPostEffects: (hitResult: PenetrationResult, zoneKey: string) => {
    const { zoneDamage, chainEvents: existingEvents, ammoId, vehicleConfig } = get();
    const details: PostEffectDetail | undefined = hitResult.postEffectDetails;
    if (!details) return;

    let updatedDamage = { ...zoneDamage };
    const newEvents: SpecialEvent[] = [...existingEvents];
    let newVehicleState = get().vehicleState;

    // 辅助函数：仅在状态优先级 >= 当前状态时才升级
    const tryUpgradeState = (candidateState: string): boolean => {
      const currentPriority = STATE_PRIORITY[newVehicleState] ?? 0;
      const candidatePriority = STATE_PRIORITY[candidateState] ?? 0;
      if (candidatePriority >= currentPriority) {
        newVehicleState = candidateState;
        return true;
      }
      return false;
    };

    // ─── 提前初始化乘员阵亡列表（后续各模块都可能修改）───
    let updatedCrewKilled = [...get().crewKilled];

    // ─── a. 处理溅射伤害（splashZones）───
    if (details.splashZones && details.splashZones.length > 0) {
      for (const splash of details.splashZones) {
        updatedDamage = applySplashDamage(updatedDamage, splash.zoneKey, splash.damage);
      }
    }

    // ─── a2. 处理破片锥溅射（spallCone fragments）───
    if (details.spallCone && details.spallCone.fragments.length > 0) {
      for (const frag of details.spallCone.fragments) {
        updatedDamage = applySplashDamage(updatedDamage, frag.zoneKey, frag.damage);
      }
    }

    // ─── b. 特殊事件判定 ───
    const currentDamage = updatedDamage[zoneKey] ?? 0;
    const ammo = getAmmo(ammoId);

    if (zoneKey.includes('ammo')) {
      // 弹药架命中 → 殉爆 / cook-off 判定
      const detonationProb = ammoDetonationProbability(
        ammoId,
        vehicleConfig.remainingAmmo,
        vehicleConfig.maxAmmo,
        vehicleConfig.hasBlowoutPanels,
        currentDamage < 50, // compartmentIntact
      );
      const roll = Math.random();
      if (roll < detonationProb) {
        // 殉爆
        newEvents.push({ type: 'ammo_detonation', zoneKey });
        tryUpgradeState('ammo_detonated');
      } else if (roll < detonationProb + 0.2) {
        // cook-off（延迟爆炸）
        const delay = cookoffDelay(vehicleConfig.remainingAmmo, vehicleConfig.hasBlowoutPanels);
        newEvents.push({ type: 'ammo_cookoff', zoneKey, delaySeconds: delay });
        tryUpgradeState('ammo_cookoff');
      }
    }

    if (zoneKey.includes('fuel')) {
      // 油箱命中 → 起火判定
      const fireProb = fuelFireProbability(
        ammoId,
        vehicleConfig.fuelType,
        vehicleConfig.fuelRemaining,
        vehicleConfig.hasFirewall,
      );
      if (Math.random() < fireProb) {
        newEvents.push({ type: 'fuel_fire', zoneKey, probability: fireProb });
        tryUpgradeState('fuel_fire');

        // 燃油起火有概率引发燃油爆炸
        const fuelExplosionProb = 0.3;
        if (Math.random() < fuelExplosionProb) {
          newEvents.push({ type: 'fuel_explosion', zoneKey });
          tryUpgradeState('fuel_exploded');
          // 燃油爆炸直接击杀所有乘员
          const allCrewMembers = VEHICLE.zones
            .flatMap((z) => z.crewMembers ?? []);
          updatedCrewKilled = [...new Set(allCrewMembers)];
        }
      }
    }

    if (zoneKey.includes('engine')) {
      // 发动机命中 → 起火判定
      const fireProb = engineFireProbability(
        ammoId,
        vehicleConfig.engineType,
        currentDamage,
      );
      if (Math.random() < fireProb) {
        newEvents.push({ type: 'engine_fire', zoneKey, probability: fireProb });
        tryUpgradeState('engine_fire');
      }

      // 发动机受损 → 停转判定（损伤越大概率停转）
      const stallProb = currentDamage / 100;
      if (Math.random() < stallProb) {
        newEvents.push({
          type: 'engine_stall',
          zoneKey,
          severity: currentDamage > 80 ? 'full' : 'partial',
        });
      }
    }

    if (zoneKey.includes('gun') || zoneKey.includes('barrel')) {
      // 火炮命中 → 卡炮判定
      if (currentDamage >= 100) {
        newEvents.push({ type: 'gun_jam', zoneKey });
      }
    }

    // ─── c. 超压伤害 ───
    if (details.overpressureKPa && details.overpressureKPa > 0) {
      const opResult = calculateOverpressure(
        0.5, // 估算 TNT 量（由穿透层已计算，这里用通用值）
        1.5, // 车内距离
      );
      // 将超压伤害写入对应分区
      updatedDamage[zoneKey] = Math.min(100, (updatedDamage[zoneKey] || 0) + opResult.damage);
      // 如果超压致命，将该分区内的乘员标记为阵亡
      if (opResult.killed) {
        const zone = VEHICLE.zones.find((z) => z.key === zoneKey);
        if (zone && zone.crewMembers && zone.crewMembers.length > 0) {
          for (const member of zone.crewMembers) {
            if (!updatedCrewKilled.includes(member)) {
              updatedCrewKilled.push(member);
            }
          }
        }
      }
    }

    // ─── c2. 模块受损状态判定 ───
    const hasDamagedModules = Object.values(updatedDamage).some(
      (d) => d > 0 && d < 100
    );
    if (hasDamagedModules && newVehicleState === 'normal') {
      tryUpgradeState('module_damaged');
    }

    // ─── c3. 乘员全员阵亡 → destroyed 判定 ───
    const totalCrewCount = VEHICLE.zones
      .flatMap((z) => z.crewMembers ?? [])
      .length || 4;
    if (updatedCrewKilled.length >= totalCrewCount) {
      tryUpgradeState('destroyed');
    }

    // ─── d. 更新状态 ───
    set({
      zoneDamage: updatedDamage,
      chainEvents: newEvents,
      vehicleState: newVehicleState,
      crewKilled: updatedCrewKilled,
    });
  },
}));

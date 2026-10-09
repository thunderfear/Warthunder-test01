// 战斗数据存取：优先调用后端 /api，失败时回退到 localStorage（保证演示始终可用）
import type { AmmoTypeId } from '../data/ammo';
import type { ArmorType, ZoneCategory } from '../data/vehicle';

export interface HitDTO {
  seq: number;
  timeOffset: number;
  ammoId: AmmoTypeId;
  caliber: number;
  distance: number;
  impactAngle: number;
  effectiveThickness: number;
  shellPen: number;
  zoneKey: string | null;
  zoneLabel?: string;
  armorType?: ArmorType;
  category?: ZoneCategory;
  penetrated: boolean;
  ricochet: boolean;
  missed: boolean;
  armorNeutralized: boolean;
  postPenDamage: number;
  crewKilled: boolean;
  resultText: string;
  postEffectDetails?: string; // JSON string of PostEffectDetail
  chainEvents?: string; // JSON string of SpecialEvent[]
  vehicleState?: string; // vehicle state after this hit
  overpressureKPa?: number; // overpressure value
  crewKilledList?: string; // JSON string of crew killed list
}

export interface BattleDTO {
  id?: string;
  playerName: string;
  playerVehicle: string;
  enemyVehicle: string;
  mapName: string;
  result: string;
  notes?: string;
  createdAt?: string;
  hits: HitDTO[];
  /** 数据来源标记：api=后端数据库，local=localStorage 离线回退（不落库，仅运行时展示用） */
  source?: 'api' | 'local';
}

export interface PagedBattles {
  items: BattleDTO[];
  total: number;
}

const LS_KEY = 'wt_hit_analysis_battles';
const USE_API = true;

function lsRead(): BattleDTO[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}
function lsWrite(list: BattleDTO[]) {
  // source 为运行时标记，不写入本地存储
  const stripped = list.map((b) => {
    const copy = { ...b };
    delete copy.source;
    return copy;
  });
  localStorage.setItem(LS_KEY, JSON.stringify(stripped));
}
function lsUpsert(b: BattleDTO) {
  const list = lsRead();
  const idx = list.findIndex((x) => x.id === b.id);
  if (idx >= 0) list[idx] = b;
  else list.unshift(b);
  lsWrite(list);
}

async function tryApi<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!USE_API) return null;
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function saveBattle(b: BattleDTO): Promise<BattleDTO> {
  const api = await tryApi(async () => {
    const res = await fetch('/api/battles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
    if (!res.ok) throw new Error('save failed');
    return (await res.json()) as BattleDTO;
  });
  if (api) return api;
  const local: BattleDTO = {
    ...b,
    id: b.id || `local_${Date.now()}`,
    createdAt: b.createdAt || new Date().toISOString(),
  };
  lsUpsert(local);
  return local;
}

export async function listBattles(): Promise<BattleDTO[]> {
  const api = await tryApi(async () => {
    const res = await fetch('/api/battles');
    if (!res.ok) throw new Error('list failed');
    return (await res.json()) as BattleDTO[];
  });
  if (api) return api.map((b) => ({ ...b, source: 'api' as const }));
  return lsRead().map((b) => ({ ...b, source: 'local' as const }));
}

// 分页获取战斗列表；API 不可用时回退为对 localStorage 数据本地分页（保证演示可用）
export async function listBattlesPaged(page: number, pageSize: number): Promise<PagedBattles> {
  const api = await tryApi(async () => {
    const res = await fetch(`/api/battles?page=${page}&pageSize=${pageSize}`);
    if (!res.ok) throw new Error('list paged failed');
    return (await res.json()) as { items: BattleDTO[]; total: number };
  });
  if (api) {
    return { items: api.items.map((b) => ({ ...b, source: 'api' as const })), total: api.total };
  }
  const local = lsRead();
  const start = (page - 1) * pageSize;
  return {
    items: local.slice(start, start + pageSize).map((b) => ({ ...b, source: 'local' as const })),
    total: local.length,
  };
}

export async function getBattle(id: string): Promise<BattleDTO | null> {
  const api = await tryApi(async () => {
    const res = await fetch(`/api/battles/${id}`);
    if (!res.ok) throw new Error('get failed');
    return (await res.json()) as BattleDTO;
  });
  if (api) return api;
  return lsRead().find((x) => x.id === id) || null;
}

export async function deleteBattle(id: string): Promise<void> {
  const api = await tryApi(async () => {
    const res = await fetch(`/api/battles/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    return true;
  });
  if (api) return;
  lsWrite(lsRead().filter((x) => x.id !== id));
}

export async function updateBattle(
  id: string,
  patch: Partial<BattleDTO>,
): Promise<BattleDTO | null> {
  const api = await tryApi(async () => {
    const res = await fetch(`/api/battles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('patch failed');
    return (await res.json()) as BattleDTO;
  });
  if (api) return api;
  const list = lsRead();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  lsWrite(list);
  return list[idx];
}

// 载具（侧视 X 光）模块/乘员/装甲分区数据
// 坐标系：viewBox 内像素坐标，载具朝左（火炮指向左侧）。
// 每个分区独立建模：标称厚度 + 倾角 + 装甲类型 + 类别。

export type ArmorType = 'RHA' | 'spaced' | 'composite' | 'ERA';
export type ZoneCategory = 'armor' | 'module' | 'crew';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zone {
  key: string;
  label: string;
  category: ZoneCategory;
  armorType: ArmorType;
  nominalThickness: number; // 标称厚度 mm
  slope: number;            // 装甲板相对竖直方向的倾角（°）
  rect: Rect;               // 点击命中 + 渲染区域
  labelPos: { x: number; y: number };
  damageWeight: number;     // 命中后造成伤害的权重基数
  // ─── 后效扩展字段（可选，向后兼容）───
  adjacentZones?: string[];        // 相邻分区key列表
  fireVulnerability?: number;      // 起火敏感度 0~1
  detonationSensitivity?: number;  // 殉爆敏感度 0~1
  crewMembers?: string[];          // 该分区内的乘员名
}

export interface VehicleDef {
  name: string;
  viewBox: { w: number; h: number };
  zones: Zone[];
}

const Z: Zone[] = [
  // 履带（底部）
  { key: 'tracks', label: '履带', category: 'module', armorType: 'RHA', nominalThickness: 30, slope: 0, rect: { x: 50, y: 322, w: 540, h: 38 }, labelPos: { x: 300, y: 348 }, damageWeight: 35, adjacentZones: ['glacis', 'hull_side'] },
  // 首上装甲（左前）
  { key: 'glacis', label: '首上装甲', category: 'armor', armorType: 'RHA', nominalThickness: 100, slope: 25, rect: { x: 55, y: 250, w: 55, h: 72 }, labelPos: { x: 82, y: 244 }, damageWeight: 30 },
  // 驾驶员
  { key: 'driver', label: '驾驶员', category: 'crew', armorType: 'RHA', nominalThickness: 80, slope: 25, rect: { x: 115, y: 252, w: 70, h: 68 }, labelPos: { x: 150, y: 288 }, damageWeight: 100, crewMembers: ['驾驶员'], adjacentZones: ['transmission', 'ammo'] },
  // 变速箱
  { key: 'transmission', label: '变速箱', category: 'module', armorType: 'RHA', nominalThickness: 45, slope: 25, rect: { x: 115, y: 200, w: 70, h: 52 }, labelPos: { x: 150, y: 226 }, damageWeight: 55 },
  // 弹药架
  { key: 'ammo', label: '弹药架', category: 'module', armorType: 'RHA', nominalThickness: 30, slope: 0, rect: { x: 190, y: 252, w: 95, h: 68 }, labelPos: { x: 237, y: 288 }, damageWeight: 90, detonationSensitivity: 0.8, adjacentZones: ['gunner', 'transmission'] },
  // 车体侧装甲
  { key: 'hull_side', label: '车体侧装甲', category: 'armor', armorType: 'RHA', nominalThickness: 80, slope: 0, rect: { x: 290, y: 252, w: 110, h: 68 }, labelPos: { x: 345, y: 288 }, damageWeight: 30 },
  // 油箱
  { key: 'fuel', label: '油箱', category: 'module', armorType: 'RHA', nominalThickness: 20, slope: 0, rect: { x: 405, y: 252, w: 70, h: 68 }, labelPos: { x: 440, y: 288 }, damageWeight: 60, fireVulnerability: 0.6, adjacentZones: ['engine', 'rear'] },
  // 发动机
  { key: 'engine', label: '发动机', category: 'module', armorType: 'RHA', nominalThickness: 30, slope: 0, rect: { x: 480, y: 252, w: 75, h: 68 }, labelPos: { x: 517, y: 288 }, damageWeight: 50, fireVulnerability: 0.4, adjacentZones: ['fuel', 'rear'] },
  // 尾部装甲（右后）
  { key: 'rear', label: '尾部装甲', category: 'armor', armorType: 'RHA', nominalThickness: 80, slope: 8, rect: { x: 555, y: 250, w: 30, h: 68 }, labelPos: { x: 570, y: 244 }, damageWeight: 30 },
  // 炮塔前装甲（左前）
  { key: 'turret_front', label: '炮塔前装甲', category: 'armor', armorType: 'RHA', nominalThickness: 100, slope: 20, rect: { x: 225, y: 150, w: 65, h: 102 }, labelPos: { x: 257, y: 142 }, damageWeight: 30 },
  // 炮闩
  { key: 'breech', label: '炮闩', category: 'module', armorType: 'RHA', nominalThickness: 45, slope: 0, rect: { x: 295, y: 150, w: 75, h: 48 }, labelPos: { x: 332, y: 176 }, damageWeight: 55 },
  // 炮手
  { key: 'gunner', label: '炮手', category: 'crew', armorType: 'RHA', nominalThickness: 80, slope: 0, rect: { x: 295, y: 205, w: 75, h: 47 }, labelPos: { x: 332, y: 232 }, damageWeight: 100, crewMembers: ['炮手'], adjacentZones: ['breech', 'ammo'] },
  // 装填手
  { key: 'loader', label: '装填手', category: 'crew', armorType: 'RHA', nominalThickness: 80, slope: 0, rect: { x: 375, y: 205, w: 60, h: 47 }, labelPos: { x: 405, y: 232 }, damageWeight: 100, crewMembers: ['装填手'], adjacentZones: ['commander', 'turret_rear'] },
  // 车长
  { key: 'commander', label: '车长', category: 'crew', armorType: 'RHA', nominalThickness: 80, slope: 0, rect: { x: 375, y: 150, w: 55, h: 48 }, labelPos: { x: 402, y: 176 }, damageWeight: 100, crewMembers: ['车长'], adjacentZones: ['loader', 'turret_rear'] },
  // 炮塔后装甲
  { key: 'turret_rear', label: '炮塔后装甲', category: 'armor', armorType: 'RHA', nominalThickness: 80, slope: 10, rect: { x: 435, y: 150, w: 55, h: 102 }, labelPos: { x: 462, y: 142 }, damageWeight: 30 },
  // 指挥塔
  { key: 'cupola', label: '指挥塔', category: 'module', armorType: 'RHA', nominalThickness: 80, slope: 0, rect: { x: 405, y: 120, w: 40, h: 30 }, labelPos: { x: 425, y: 112 }, damageWeight: 30 },
  // 火炮身管
  { key: 'barrel', label: '火炮身管', category: 'module', armorType: 'RHA', nominalThickness: 30, slope: 0, rect: { x: 45, y: 192, w: 180, h: 18 }, labelPos: { x: 135, y: 186 }, damageWeight: 25 },
];

export const VEHICLE: VehicleDef = {
  name: '示例重型坦克（Tiger 级）',
  viewBox: { w: 640, h: 380 },
  zones: Z,
};

export function getZone(key: string): Zone | undefined {
  return VEHICLE.zones.find((z) => z.key === key);
}

// 点击坐标 -> 命中的分区（点是否在矩形内）
export function zoneAtPoint(px: number, py: number): Zone | null {
  for (const z of VEHICLE.zones) {
    const { x, y, w, h } = z.rect;
    if (px >= x && px <= x + w && py >= y && py <= y + h) return z;
  }
  return null;
}

// 3D 载具数据：示例重型坦克（Tiger 级）
// 坐标系：X=左右（负左正右），Y=上下（负下正上），Z=前后（负前正后）
// 所有尺寸单位：米

import type { VehicleDef3D, Zone3DDef, Zone3D } from './types3d';

const ZONES: Zone3DDef[] = [
  // ─── 车体下半部 ───

  // 1. 履带（左右两条，mirrorX 双侧对称）
  {
    id: 'tracks',
    name: 'Tracks',
    nameZh: '履带',
    health: 100,
    armor: 30,
    armorType: 'RHA',
    collision: { type: 'box', size: [0.5, 0.4, 6.0], position: [1.25, -0.6, 0] },
    mirrorX: true, // 右侧主声明 + x→-x 镜像副本，左右两侧均有可见碰撞体
    color: '#3a3a3a',
  },
  // 2. 首上装甲（车体前上方倾斜装甲，rotation 25° 后法线朝前上方）
  {
    id: 'glacis',
    name: 'Upper Glacis',
    nameZh: '首上装甲',
    health: 100,
    armor: 100,
    armorType: 'RHA',
    collision: {
      type: 'box',
      size: [2.4, 0.8, 0.3],
      position: [0, -0.1, -3.2],
      rotation: [25, 0, 0],
    },
    color: '#5a6e4a',
    surfaceNormal: [0, 0.4226, -0.9063], // 旋转 25° 后的前方向量
  },
  // 3. 驾驶员（车体左前部）
  {
    id: 'driver',
    name: 'Driver',
    nameZh: '驾驶员',
    health: 100,
    armor: 80,
    armorType: 'RHA',
    collision: { type: 'sphere', radius: 0.35, position: [-0.6, 0.0, -2.2] },
    color: '#cc4444',
  },
  // 4. 变速箱（车体前部下方）
  {
    id: 'transmission',
    name: 'Transmission',
    nameZh: '变速箱',
    health: 100,
    armor: 45,
    armorType: 'RHA',
    collision: { type: 'box', size: [1.2, 0.5, 0.8], position: [0, -0.5, -2.5] },
    color: '#888888',
  },
  // 5. 弹药架（车体中部偏前）
  {
    id: 'ammo',
    name: 'Ammo Rack',
    nameZh: '弹药架',
    health: 100,
    armor: 30,
    armorType: 'RHA',
    collision: { type: 'box', size: [1.0, 0.6, 0.8], position: [0.3, -0.2, -0.8] },
    color: '#cc8800',
  },
  // 6. 车体侧装甲（车体中部侧面，mirrorX 双侧对称，法线朝左/右）
  {
    id: 'hull_side',
    name: 'Hull Side Armor',
    nameZh: '车体侧装甲',
    health: 100,
    armor: 80,
    armorType: 'RHA',
    collision: { type: 'box', size: [0.15, 0.8, 2.2], position: [1.2, -0.1, 0] },
    mirrorX: true, // 右侧主声明 + x→-x 镜像副本，左右两侧均有可见碰撞体
    color: '#5a6e4a',
    surfaceNormal: [-1, 0, 0], // 侧装甲法线朝左（入射角取 |dot|、反射平面与 ±X 等价，双侧共用）
  },
  // 7. 油箱（车体中部偏后）
  {
    id: 'fuel',
    name: 'Fuel Tank',
    nameZh: '油箱',
    health: 100,
    armor: 20,
    armorType: 'RHA',
    collision: { type: 'box', size: [0.8, 0.6, 1.0], position: [0, -0.2, 1.2] },
    color: '#aa3300',
  },
  // 8. 发动机（车体后部）
  {
    id: 'engine',
    name: 'Engine',
    nameZh: '发动机',
    health: 100,
    armor: 30,
    armorType: 'RHA',
    collision: { type: 'box', size: [1.8, 1.0, 1.2], position: [0, -0.1, 2.5] },
    color: '#666666',
  },
  // 9. 尾部装甲（车体最后方，法线朝后）
  {
    id: 'rear',
    name: 'Rear Armor',
    nameZh: '尾部装甲',
    health: 100,
    armor: 80,
    armorType: 'RHA',
    collision: {
      type: 'box',
      size: [2.4, 1.0, 0.2],
      position: [0, -0.1, 3.3],
      rotation: [8, 0, 0],
    },
    color: '#5a6e4a',
    surfaceNormal: [0, 0, 1], // 尾部装甲法线朝后
  },

  // ─── 炮塔 ───

  // 10. 炮塔前装甲（法线朝前，略向上倾斜 20°）
  {
    id: 'turret_front',
    name: 'Turret Front',
    nameZh: '炮塔前装甲',
    health: 100,
    armor: 100,
    armorType: 'RHA',
    collision: {
      type: 'box',
      size: [2.0, 0.8, 0.4],
      position: [0, 0.7, -1.0],
      rotation: [20, 0, 0],
    },
    color: '#6b7f5a',
    surfaceNormal: [0, 0.3420, -0.9397], // 旋转 20° 后的前方向量
  },
  // 11. 炮闩（炮塔内火炮机构）
  {
    id: 'breech',
    name: 'Breech',
    nameZh: '炮闩',
    health: 100,
    armor: 45,
    armorType: 'RHA',
    collision: { type: 'box', size: [0.6, 0.4, 1.0], position: [0, 0.6, -0.3] },
    color: '#777777',
  },
  // 12. 炮手（炮塔左前）
  {
    id: 'gunner',
    name: 'Gunner',
    nameZh: '炮手',
    health: 100,
    armor: 80,
    armorType: 'RHA',
    collision: { type: 'sphere', radius: 0.35, position: [-0.5, 0.6, 0.0] },
    color: '#cc4444',
  },
  // 13. 装填手（炮塔右后）
  {
    id: 'loader',
    name: 'Loader',
    nameZh: '装填手',
    health: 100,
    armor: 80,
    armorType: 'RHA',
    collision: { type: 'sphere', radius: 0.35, position: [0.5, 0.6, 0.4] },
    color: '#cc4444',
  },
  // 14. 车长（炮塔右前上方）
  {
    id: 'commander',
    name: 'Commander',
    nameZh: '车长',
    health: 100,
    armor: 80,
    armorType: 'RHA',
    collision: { type: 'sphere', radius: 0.35, position: [0.4, 0.8, -0.4] },
    color: '#cc4444',
  },
  // 15. 炮塔后装甲（法线朝后，略向上倾斜 10°）
  {
    id: 'turret_rear',
    name: 'Turret Rear',
    nameZh: '炮塔后装甲',
    health: 100,
    armor: 80,
    armorType: 'RHA',
    collision: {
      type: 'box',
      size: [1.8, 0.8, 0.3],
      position: [0, 0.7, 0.8],
      rotation: [10, 0, 0],
    },
    color: '#6b7f5a',
    surfaceNormal: [0, 0.1736, 0.9848], // 旋转 10° 后的后方向量
  },
  // 16. 指挥塔（炮塔顶部小圆塔）
  {
    id: 'cupola',
    name: 'Cupola',
    nameZh: '指挥塔',
    health: 100,
    armor: 80,
    armorType: 'RHA',
    collision: { type: 'sphere', radius: 0.25, position: [0.4, 1.2, -0.4] },
    color: '#5a6e4a',
  },
  // 17. 火炮身管
  {
    id: 'barrel',
    name: 'Gun Barrel',
    nameZh: '火炮身管',
    health: 100,
    armor: 30,
    armorType: 'RHA',
    collision: {
      type: 'box',
      size: [0.15, 0.15, 3.0],
      position: [0, 0.6, -3.0],
    },
    color: '#4a4a4a',
  },
];

export const VEHICLE_3D: VehicleDef3D = {
  id: 'tiger_heavy_tank',
  name: '示例重型坦克（Tiger 级）',
  nation: 'Germany',
  br: 5.7,
  zones: ZONES,
  modelOffset: [0, 0, 0],
};

// 按 id 查找分区
export function getZone3D(id: string): Zone3DDef | undefined {
  return VEHICLE_3D.zones.find((z) => z.id === id);
}

// ─── 镜像语义唯一权威定义（mirrorX 分区双侧渲染/碰撞均由此派生）───

/**
 * 将碰撞/视觉体沿 YZ 平面（x→-x）镜像：position.x 取反；
 * rotation 若存在则取 [rx, -ry, -rz]（YZ 平面镜像下的共轭旋转：
 * 绕 X 轴分量不变，Y/Z 轴分量取反，保证镜像体姿态与主体左右对称）。
 */
export function mirrorZone3D(b: Zone3D): Zone3D {
  if (b.type === 'box') {
    return {
      ...b,
      position: [-b.position[0], b.position[1], b.position[2]],
      rotation: b.rotation ? [b.rotation[0], -b.rotation[1], -b.rotation[2]] : undefined,
    };
  }
  return {
    ...b,
    position: [-b.position[0], b.position[1], b.position[2]],
  };
}

/**
 * 返回分区的全部碰撞中心点：非镜像分区仅 [collision.position]；
 * mirrorX 分区额外附加镜像点，供最近邻归因（如 findNearestZone3DKey）使用。
 */
export function getZoneCollisionCenters(zone: Zone3DDef): [number, number, number][] {
  const centers: [number, number, number][] = [zone.collision.position];
  if (zone.mirrorX) {
    centers.push(mirrorZone3D(zone.collision).position);
  }
  return centers;
}

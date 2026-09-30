// 本轮新增纯函数 / 新分支的回归单元测试：
// 1. vehicle3d.ts 的 mirrorZone3D / getZoneCollisionCenters（mirrorX 双侧镜像语义）
// 2. penetration.ts 的 findNearestZone3DKey（模块私有，经 evaluateHit3D 间接验证：
//    HE 弹 postPen='blast' 命中必算后效，postEffectDetails.splashZones 的 zoneKey
//    集合 === 2D VEHICLE 中 nearestZoneKey 对应分区的 adjacentZones，据此反推归因）
// 3. HitSimulator.ts 的 synthSceneTrajectory（场景内合成直线视觉轨迹）
// 4. evaluateHit3D 结果 coordSpace 缺省回退（未打标视为 ballistic）
import { describe, it, expect } from 'vitest';
import { getZone3D, mirrorZone3D, getZoneCollisionCenters } from '../../data/vehicle3d';
import type { Zone3D, Zone3DDef } from '../../data/types3d';
import { evaluateHit3D, type Armor3D } from '../penetration';
import { synthSceneTrajectory, simulateHit3DStraight } from '../HitSimulator';
import { getAmmo } from '../../data/ammo';

// ─── mirrorZone3D：YZ 平面镜像语义（position.x 取反；rotation 共轭旋转）───

describe('mirrorZone3D（YZ 平面镜像）', () => {
  it('无 rotation 的 box：仅 position.x 取反，其余字段不变（tracks 现状）', () => {
    const tracks = getZone3D('tracks')!;
    const m = mirrorZone3D(tracks.collision);
    expect(m.type).toBe('box');
    if (m.type === 'box') {
      expect(m.position).toEqual([-1.25, -0.6, 0]); // 源 [1.25, -0.6, 0]
      expect(m.size).toEqual([0.5, 0.4, 6.0]);
      expect(m.rotation).toBeUndefined();
    }
  });

  it('带 rotation 的 box：rotation 变换为 [rx, -ry, -rz]（YZ 平面镜像共轭旋转）', () => {
    const box: Zone3D = {
      type: 'box',
      size: [2.4, 0.8, 0.3],
      position: [2.5, -0.6, 1.0],
      rotation: [10, 20, -30],
    };
    const m = mirrorZone3D(box);
    expect(m.type).toBe('box');
    if (m.type === 'box') {
      expect(m.position).toEqual([-2.5, -0.6, 1.0]); // 仅 x 取反，y/z 保持
      expect(m.rotation).toEqual([10, -20, 30]);     // 绕 X 分量不变，Y/Z 分量取反
      expect(m.size).toEqual([2.4, 0.8, 0.3]);
    }
  });

  it('sphere：position.x 取反，radius 不变', () => {
    const gunner = getZone3D('gunner')!;
    const m = mirrorZone3D(gunner.collision);
    expect(m.type).toBe('sphere');
    if (m.type === 'sphere') {
      expect(m.position).toEqual([0.5, 0.6, 0]); // 源 [-0.5, 0.6, 0]
      expect(m.radius).toBe(0.35);
    }
  });

  it('真实 glacis 分区（position.x=0 且 rotation=[25,0,0]）：x 与 y/z 旋转分量仍严格取反', () => {
    // 0 取反在 IEEE-754 下为 -0（数值等于 0），用 toBe 严格校验"取反"语义
    const glacis = getZone3D('glacis')!;
    const src = glacis.collision;
    const m = mirrorZone3D(src);
    expect(m.type).toBe('box');
    if (m.type === 'box' && src.type === 'box') {
      expect(m.position[0]).toBe(-src.position[0]);     // 0 → -0
      expect(m.position[1]).toBe(-0.1);
      expect(m.position[2]).toBe(-3.2);
      expect(m.rotation![0]).toBe(25);                  // 绕 X 分量不变
      expect(m.rotation![1]).toBe(-src.rotation![1]);   // 0 → -0
      expect(m.rotation![2]).toBe(-src.rotation![2]);   // 0 → -0
    }
  });

  it('纯函数：不修改输入对象', () => {
    const tracks = getZone3D('tracks')!;
    const before = JSON.parse(JSON.stringify(tracks.collision));
    const m = mirrorZone3D(tracks.collision);
    expect(m).not.toBe(tracks.collision);   // 返回新对象
    expect(tracks.collision).toEqual(before); // 源未被改动
  });
});

// ─── getZoneCollisionCenters：最近邻归因用的碰撞中心 ───

function makeZone3DDef(collision: Zone3D, mirrorX?: boolean): Zone3DDef {
  return {
    id: 'test_zone',
    name: 'Test Zone',
    nameZh: '测试分区',
    health: 100,
    armor: 80,
    armorType: 'RHA',
    collision,
    ...(mirrorX ? { mirrorX } : {}),
  };
}

describe('getZoneCollisionCenters（碰撞中心派生）', () => {
  it('非镜像分区（glacis）返回单一中心', () => {
    const glacis = getZone3D('glacis')!;
    const centers = getZoneCollisionCenters(glacis);
    expect(centers).toHaveLength(1);
    expect(centers[0]).toEqual([0, -0.1, -3.2]);
  });

  it('非镜像 sphere 分区（gunner）同样单中心', () => {
    const gunner = getZone3D('gunner')!;
    const centers = getZoneCollisionCenters(gunner);
    expect(centers).toHaveLength(1);
    expect(centers[0]).toEqual([-0.5, 0.6, 0]);
  });

  it('mirrorX 分区（tracks）返回主中心 + 镜像中心', () => {
    const tracks = getZone3D('tracks')!;
    const centers = getZoneCollisionCenters(tracks);
    expect(centers).toHaveLength(2);
    expect(centers[0]).toEqual([1.25, -0.6, 0]);  // 主声明中心在前
    expect(centers[1]).toEqual([-1.25, -0.6, 0]); // x→-x 镜像中心在后
  });

  it('mirrorX 分区（hull_side）左右双中心对称', () => {
    const hullSide = getZone3D('hull_side')!;
    const centers = getZoneCollisionCenters(hullSide);
    expect(centers).toHaveLength(2);
    expect(centers[0]).toEqual([1.2, -0.1, 0]);
    expect(centers[1]).toEqual([-1.2, -0.1, 0]);
  });

  it('带 rotation 的自定义 mirrorX 分区：镜像中心只翻 position.x，rotation 不参与中心计算', () => {
    const zone = makeZone3DDef(
      { type: 'box', size: [1, 1, 1], position: [2, 1, 3], rotation: [15, 15, 15] },
      true,
    );
    expect(getZoneCollisionCenters(zone)).toEqual([
      [2, 1, 3],
      [-2, 1, 3],
    ]);
  });
});

// ─── findNearestZone3DKey：最近邻归因（私有函数，经 evaluateHit3D 间接验证）───

describe('findNearestZone3DKey 最近邻归因（经 evaluateHit3D 间接验证）', () => {
  // findNearestZone3DKey 为 penetration.ts 模块私有函数（入参为 Vector3 对象）。
  // 间接路径：HE 弹 postPen='blast' 命中必算后效，splashZones 的 zoneKey 集合即
  // 2D VEHICLE 中 nearestZoneKey 分区的 adjacentZones：
  // - hull_side / glacis 在 2D 数据中无 adjacentZones → splashZones/fragments 均为空
  // - ammo → ['gunner', 'transmission']；fuel → ['engine', 'rear']；gunner → ['breech', 'ammo']
  function heEffectZoneKeys(impactPoint: { x: number; y: number; z: number }) {
    const armor: Armor3D = {
      nominalThickness: 80,
      normalVector: { x: 1, y: 0, z: 0 },
      armorType: 'RHA',
      category: 'armor',
      label: '测试装甲',
    };
    const r = evaluateHit3D({
      ammo: getAmmo('HE'),
      armor,
      impactPoint,
      shotDirection: { x: 1, y: 0, z: 0 }, // 与法线平行 → 垂直命中
      distance: 400,
    });
    expect(r.penetrated).toBe(true); // HE 命中即爆破，后效必已计算
    return {
      splashZoneKeys: (r.postEffectDetails?.splashZones ?? []).map((s) => s.zoneKey),
      fragmentZoneKeys: (r.postEffectDetails?.spallCone?.fragments ?? []).map((f) => f.zoneKey),
    };
  }

  it('右侧命中点归因 hull_side 而非内部分区 ammo', () => {
    // 命中点紧贴右侧车体侧装甲面；若错误归因 ammo，splash 将波及 gunner/transmission
    const { splashZoneKeys, fragmentZoneKeys } = heEffectZoneKeys({ x: 1.275, y: -0.1, z: 0 });
    expect(splashZoneKeys).toEqual([]);   // hull_side 无相邻分区
    expect(fragmentZoneKeys).toEqual([]);
  });

  it('左侧命中点同样归因 hull_side（依赖 mirrorX 镜像中心）', () => {
    // 若镜像中心缺失，左侧点会错误归因 gunner → splash 波及 breech/ammo、破片含二级溅射
    const { splashZoneKeys, fragmentZoneKeys } = heEffectZoneKeys({ x: -1.275, y: -0.1, z: 0 });
    expect(splashZoneKeys).toEqual([]);
    expect(fragmentZoneKeys).toEqual([]);
  });

  it('中央命中点（glacis 区域）归因 glacis', () => {
    const { splashZoneKeys, fragmentZoneKeys } = heEffectZoneKeys({ x: 0, y: -0.1, z: -3.2 });
    expect(splashZoneKeys).toEqual([]);   // glacis 无相邻分区
    expect(fragmentZoneKeys).toEqual([]);
  });

  it('对照：ammo 中心命中 → splash 精确波及 gunner/transmission（机制非空验证）', () => {
    const { splashZoneKeys, fragmentZoneKeys } = heEffectZoneKeys({ x: 0.3, y: -0.2, z: -0.8 });
    expect(splashZoneKeys).toEqual(['gunner', 'transmission']);
    expect(fragmentZoneKeys.length).toBeGreaterThan(0); // 含二级破片溅射（breech）
  });

  it('对照：fuel 中心命中 → splash 精确波及 engine/rear', () => {
    const { splashZoneKeys } = heEffectZoneKeys({ x: 0, y: -0.2, z: 1.2 });
    expect(splashZoneKeys).toEqual(['engine', 'rear']);
  });
});

// ─── synthSceneTrajectory：场景内合成直线视觉轨迹 ───

describe('synthSceneTrajectory（场景内合成直线轨迹）', () => {
  it('常规目标：返回 [生成点, 目标点] 两点直线，生成点位于原点→目标方向延长 13 处', () => {
    const traj = synthSceneTrajectory({ x: 3, y: 4, z: 0 }); // |target| = 5
    expect(traj).toHaveLength(2);
    expect(traj[1]).toEqual({ x: 3, y: 4, z: 0 }); // 终点 = 目标点
    // 生成点 = target/5 * 13 = (7.8, 10.4, 0)
    expect(traj[0].x).toBeCloseTo(7.8, 6);
    expect(traj[0].y).toBeCloseTo(10.4, 6);
    expect(traj[0].z).toBeCloseTo(0, 6);
    expect(Math.hypot(traj[0].x, traj[0].y, traj[0].z)).toBeCloseTo(13, 6); // 默认半径
  });

  it('自定义 spawnRadius：生成点沿同方向放大至指定半径', () => {
    const traj = synthSceneTrajectory({ x: 0, y: 0, z: 5 }, 26);
    expect(traj).toHaveLength(2);
    expect(traj[0]).toEqual({ x: 0, y: 0, z: 26 });
    expect(traj[1]).toEqual({ x: 0, y: 0, z: 5 });
  });

  it('真实分区目标（hull_side 碰撞中心）：生成点与目标共线同向、距离为默认半径', () => {
    const target = { x: 1.2, y: -0.1, z: 0 }; // hull_side 主碰撞中心
    const traj = synthSceneTrajectory(target);
    expect(traj).toHaveLength(2);
    expect(traj[1]).toEqual(target);
    const [spawn, hit] = traj;
    // 共线（叉积各分量为 0）且同向（点积为正）
    expect(spawn.y * hit.z - spawn.z * hit.y).toBeCloseTo(0, 6);
    expect(spawn.z * hit.x - spawn.x * hit.z).toBeCloseTo(0, 6);
    expect(spawn.x * hit.y - spawn.y * hit.x).toBeCloseTo(0, 6);
    expect(spawn.x * hit.x + spawn.y * hit.y + spawn.z * hit.z).toBeGreaterThan(0);
    expect(Math.hypot(spawn.x, spawn.y, spawn.z)).toBeCloseTo(13, 6);
  });

  it('目标在原点：退化为 +Z 方向生成点（默认半径 13）', () => {
    const traj = synthSceneTrajectory({ x: 0, y: 0, z: 0 });
    expect(traj).toHaveLength(2);
    expect(traj[0]).toEqual({ x: 0, y: 0, z: 13 });
    expect(traj[1]).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('目标在原点且自定义半径：退化方向沿用自定义半径', () => {
    const traj = synthSceneTrajectory({ x: 0, y: 0, z: 0 }, 7);
    expect(traj[0]).toEqual({ x: 0, y: 0, z: 7 });
    expect(traj[1]).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('目标接近原点（|target| < 1e-6）：同样退化兜底', () => {
    const traj = synthSceneTrajectory({ x: 1e-9, y: 1e-9, z: -1e-9 });
    expect(traj).toHaveLength(2);
    expect(traj[0]).toEqual({ x: 0, y: 0, z: 13 });
    expect(traj[1]).toEqual({ x: 1e-9, y: 1e-9, z: -1e-9 });
  });
});

// ─── coordSpace 坐标系打标缺省回退 ───

describe('coordSpace 坐标系打标缺省回退', () => {
  it('evaluateHit3D 命中装甲：结果未显式设置 coordSpace（缺省视为 ballistic）', () => {
    const r = evaluateHit3D({
      ammo: getAmmo('HE'),
      armor: {
        nominalThickness: 80,
        normalVector: { x: 1, y: 0, z: 0 },
        armorType: 'RHA',
        category: 'armor',
        label: '测试装甲',
      },
      impactPoint: { x: 1.2, y: -0.1, z: 0 },
      shotDirection: { x: 1, y: 0, z: 0 },
      distance: 400,
    });
    expect(r.coordSpace).toBeUndefined();
    expect('coordSpace' in r).toBe(false);
  });

  it('evaluateHit3D 未命中（armor=null）同样无 coordSpace 字段', () => {
    const r = evaluateHit3D({
      ammo: getAmmo('AP'),
      armor: null,
      impactPoint: { x: 500, y: 0, z: 0 },
      shotDirection: { x: 1, y: 0, z: 0 },
      distance: 500,
    });
    expect(r.missed).toBe(true);
    expect(r.coordSpace).toBeUndefined();
  });

  it('对照：simulateHit3DStraight 显式打标 coordSpace=three（渲染端据此分流置换）', () => {
    const sim = simulateHit3DStraight('HE', 400, { x: 1.2, y: -0.1, z: 0 });
    expect(sim.result.coordSpace).toBe('three');
  });
});

// 弹道与入射角计算（简化抛物线模型）
// 适用范围：0–1500m，误差约 ±3°；1500m 以上需引入弹道系数表精确积分。
// 模型说明：忽略空气阻力时弹道为抛物线；弹道系数(BC)越大阻力越小、下落越少。

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface BallisticInput {
  distance: number;       // 交战距离（米）
  muzzleVelocity: number; // 初速（m/s）
  ballisticCoefficient: number; // 弹道系数
}

export interface BallisticResult {
  timeOfFlight: number;   // 飞行时间（秒）
  drop: number;           // 下落量（米）
  impactAngleDeg: number; // 入射角（相对水平面的俯角，°）
}

export interface BallisticInput3D {
  muzzleVelocity: number;       // 初速（m/s）
  caliber: number;              // 口径 mm
  ballisticCoefficient: number; // 弹道系数
  distance: number;             // 交战距离（米）
  angle: number;                // 3D入射俯角（°，相对水平面）
  airDensity?: number;          // 空气密度 kg/m³（默认 1.225 海平面标准大气）
  windSpeed?: Vector3;          // 风速向量（m/s），x=顺风，y=横风，z=垂直风
}

export interface BallisticResult3D {
  impactPoint: Vector3;       // 落点坐标（米），x=前方，y=右侧，z=上方
  impactVelocity: number;     // 落地速度（m/s）
  impactAngleDeg: number;     // 落地俯角（°）
  timeOfFlight: number;       // 飞行时间（秒）
  drop: number;               // 下落量（米）
  velocityVector: Vector3;    // 落地速度向量
}

const G = 9.81;

export function computeBallistics(input: BallisticInput): BallisticResult {
  const d = Math.max(1, input.distance);
  const v0 = Math.max(1, input.muzzleVelocity);
  const bc = Math.max(0.2, input.ballisticCoefficient);

  // 水平飞行时间（忽略阻力的一阶近似）
  const t = d / v0;

  // 真空下落量
  let drop = 0.5 * G * t * t;

  // 阻力修正：BC 越大下落越少（clamp 避免极端值）
  const dragFactor = Math.min(1.3, Math.max(0.8, 1.4 - bc));
  drop = drop * dragFactor;

  const impactAngleDeg = (Math.atan2(drop, d) * 180) / Math.PI;
  return { timeOfFlight: t, drop, impactAngleDeg };
}

/**
 * 3D弹道计算（参数化抛物线模型 + 空气密度/风速修正）
 * 坐标系：x=射击前方，y=右侧，z=上方
 */
export function computeBallistics3D(input: BallisticInput3D): BallisticResult3D {
  const d = Math.max(1, input.distance);
  const v0 = Math.max(1, input.muzzleVelocity);
  const bc = Math.max(0.2, input.ballisticCoefficient);
  const angleRad = (input.angle * Math.PI) / 180;
  const rho = input.airDensity ?? 1.225;
  const wind = input.windSpeed ?? { x: 0, y: 0, z: 0 };

  // 空气密度修正因子：标准大气 1.225 kg/m³ 为基准
  // 密度越大阻力越大，下落越多
  const densityFactor = rho / 1.225;

  // 阻力修正：BC 越大下落越少
  const dragFactor = Math.min(1.3, Math.max(0.8, 1.4 - bc));

  // 综合阻力系数
  const totalDrag = dragFactor * densityFactor;

  // 初速度分量
  const vx0 = v0 * Math.cos(angleRad); // 水平分量
  const vz0 = v0 * Math.sin(angleRad); // 垂直分量（向上为正）

  // 飞行时间（一阶近似：水平距离 / 水平速度）
  const t = d / Math.max(1, vx0);

  // 真空下落量 + 阻力修正
  let drop = 0.5 * G * t * t * totalDrag;

  // 风速影响：顺风减小相对速度→增加下落；横风产生侧偏
  const effectiveWindX = wind.x; // 顺风分量
  const windY = wind.y;          // 横风分量

  // 顺风修正：顺风减小水平相对速度，增加飞行时间和下落
  const adjustedT = d / Math.max(1, vx0 - effectiveWindX);
  drop = 0.5 * G * adjustedT * adjustedT * totalDrag;

  // 横风侧偏（一阶近似）
  const driftY = windY * adjustedT;

  // 落点坐标
  const impactPoint: Vector3 = {
    x: d,
    y: driftY,
    z: -drop, // z 向上为正，下落为负
  };

  // 落地速度
  const vzFinal = vz0 - G * adjustedT; // 垂直末速度
  const vxGround = vx0 - effectiveWindX; // 水平末速度（考虑风）
  const vyGround = windY;               // 横风方向速度

  // 速度衰减：空气阻力使速度降低（一阶近似）
  const speedRetention = Math.max(0.5, 1.0 - 0.15 * totalDrag * (d / 1000));
  const impactVelocity = Math.sqrt(
    vxGround * vxGround + vyGround * vyGround + vzFinal * vzFinal
  ) * speedRetention;

  // 落地角度
  const impactAngleDeg = (Math.atan2(Math.abs(drop), d) * 180) / Math.PI;

  // 速度向量
  const velocityVector: Vector3 = {
    x: vxGround * speedRetention,
    y: vyGround * speedRetention,
    z: vzFinal * speedRetention,
  };

  return {
    impactPoint,
    impactVelocity,
    impactAngleDeg,
    timeOfFlight: adjustedT,
    drop,
    velocityVector,
  };
}

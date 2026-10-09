// 可播种随机源：mulberry32 伪随机算法
// 同一 seed 产生完全相同的序列，使命中判定/后效连锁结果可重现（回放、回归测试、bug 复现）
// 未注入 rng 的调用方回退 Math.random，行为与旧版一致（向后兼容）

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

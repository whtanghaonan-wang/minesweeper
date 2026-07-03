import { type Board, createBoard, neighbors } from "./board";
import { isSolvable } from "./solver";
import type { LevelSpec } from "./levels";

/**
 * 生成保证无猜的盘面：随机布雷（首格 3×3 安全区无雷）→ 求解器验证 → 不可解则重试。
 * 绝不降级：只会返回可全程逻辑推完的盘。每 200 次失败回调一次 onSlow。
 */
export function generate(
  level: LevelSpec,
  firstIdx: number,
  rng: () => number,
  onSlow?: (attempts: number) => void,
): Board {
  const probe = createBoard(level.width, level.height, []);
  const excluded = new Set([firstIdx, ...neighbors(probe, firstIdx)]);
  const candidates: number[] = [];
  for (let i = 0; i < level.width * level.height; i++) {
    if (!excluded.has(i)) candidates.push(i);
  }

  let attempts = 0;
  for (;;) {
    attempts++;
    if (attempts % 200 === 0) {
      console.warn(`generate: level ${level.id} 已尝试 ${attempts} 次`);
      onSlow?.(attempts);
    }
    const mineIdxs = sample(candidates, level.mines, rng);
    const b = createBoard(level.width, level.height, mineIdxs);
    try {
      if (isSolvable(b, firstIdx)) return b;
    } catch (e) {
      // 健全性哨兵触发意味着求解器缺陷；丢弃本盘重试，保证不外泄错误盘
      console.error("generate: solver sentinel", e);
    }
  }
}

/** 从 pool 中等概率抽取 n 个（部分 Fisher-Yates，不修改原数组） */
function sample(pool: number[], n: number, rng: () => number): number[] {
  const a = [...pool];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

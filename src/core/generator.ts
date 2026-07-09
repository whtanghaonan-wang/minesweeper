import { type Board, createBoard, neighbors } from "./board";
import { solveProbe } from "./solver";
import type { LevelSpec } from "./levels";

/** 单盘修补次数上限;超过则整盘作废重撒(防极端死循环) */
export const PERTURB_MAX = 50;

/**
 * 生成保证无猜的盘面(v2.2 修补式,设计文档 §1.2):
 * 随机布雷(首格 3×3 安全区无雷)→ 求解器从首格全程推演;卡死时不废盘,
 * 把全部雷收进「本轮未揭开的格子」重撒(已推开安全骨架保持无雷),再从首格从头重推。
 * 返回的盘必定完整通过了与 isSolvable 一字不差的推演——绝不降级。
 * 每累计 200 次推演回调一次 onSlow。
 */
export function generate(
  level: LevelSpec,
  firstIdx: number,
  rng: () => number,
  onSlow?: (attempts: number) => void,
): Board {
  const probe = createBoard(level.width, level.height, []);
  const excluded = new Set([firstIdx, ...neighbors(probe, firstIdx)]);
  const all: number[] = [];
  for (let i = 0; i < level.width * level.height; i++) {
    if (!excluded.has(i)) all.push(i);
  }

  let attempts = 0;
  for (;;) {
    let b = createBoard(level.width, level.height, sample(all, level.mines, rng));
    for (let p = 0; p <= PERTURB_MAX; p++) {
      attempts++;
      if (attempts % 200 === 0) {
        console.warn(`generate: level ${level.id} 已尝试 ${attempts} 次`);
        onSlow?.(attempts);
      }
      let r;
      try {
        r = solveProbe(b, firstIdx);
      } catch (e) {
        // 健全性哨兵触发意味着求解器缺陷；丢弃本盘整盘重来，保证不外泄错误盘
        console.error("generate: solver sentinel", e);
        break;
      }
      // solveProbe 在副本上推演,b 自创建后未被触碰,始终是未开局的干净盘
      if (r.solved) return b;
      const open = r.revealed;
      const candidates = all.filter((i) => !open[i]);
      if (candidates.length < level.mines) break; // 未开区放不下全部雷 → 整盘重来
      b = createBoard(level.width, level.height, sample(candidates, level.mines, rng));
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

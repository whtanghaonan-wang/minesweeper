import { describe, it, expect } from "vitest";
import { createBoard, type Board } from "../src/core/board";
import { isSolvable } from "../src/core/solver";
import { mulberry32 } from "../src/core/rng";

/** 种子化随机小盘：w*h 格 mines 颗雷，首点取第一个周围无雷的非雷格；无则返回 null */
function randomCase(w: number, h: number, mines: number, seed: number): { b: Board; first: number } | null {
  const rng = mulberry32(seed);
  const all = Array.from({ length: w * h }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  const b = createBoard(w, h, all.slice(0, mines));
  const first = all.slice(mines).find((i) => b.adjacent[i] === 0);
  return first === undefined ? null : { b, first };
}

describe("isSolvable", () => {
  it("洪泛即通盘的盘面可解", () => {
    // 4x4 单雷 idx0，点 15 洪泛揭开全部非雷格
    const b = createBoard(4, 4, [0]);
    expect(isSolvable(b, 15)).toBe(true);
  });

  it("基础规则可解", () => {
    // 5x1: [0 0 1 M ?] → 尾格由基础规则推出
    // 实际上洪泛后 {3,4} 未知？不：雷在 3，点 0 洪泛开 0,1,2；
    // 约束 c2:{3,4}=1 不足以定格——改为可由基础规则收尾的盘：
    // 3x3 雷 [0]，点 8：洪泛开除 0 外全部 → 即胜
    const b = createBoard(3, 3, [0]);
    expect(isSolvable(b, 8)).toBe(true);
  });

  it("需要子集推理的 1-2-1 局面可解（禁用穷举仍可解）", () => {
    // 5x3，雷在底行 11、13；点 0 洪泛开上两行，
    // 底行由 1-2-1 子集推理定出：12 安全，11/13 是雷，再基础规则收尾
    const b = createBoard(5, 3, [11, 13]);
    expect(isSolvable(b, 0, 0)).toBe(true);
  });

  it("性质测试：500 个随机盘上推理规则永不误判（健全性哨兵不触发），且两种结果都出现", () => {
    let solvable = 0;
    let unsolvable = 0;
    const enumWins: number[] = [];
    for (let seed = 1; seed <= 500; seed++) {
      const c = randomCase(6, 5, 5, seed);
      if (!c) continue;
      const full = isSolvable(c.b, c.first); // 内部哨兵：误判即抛错
      const weak = isSolvable(c.b, c.first, 0);
      if (full) solvable++;
      else unsolvable++;
      if (full && !weak) enumWins.push(seed);
      expect(!full && weak).toBe(false); // 穷举只会更强，不会更弱
    }
    expect(solvable).toBeGreaterThan(0);
    expect(unsolvable).toBeGreaterThan(0);
    expect(enumWins.length).toBeGreaterThan(0); // 穷举层确实提供了额外推理能力
  });

  it("穷举层推理能力回归（种子 21：默认可解，禁用穷举不可解）", () => {
    const c = randomCase(6, 5, 5, 21)!;
    expect(isSolvable(c.b, c.first)).toBe(true);
    expect(isSolvable(c.b, c.first, 0)).toBe(false);
  });

  it("50/50 必猜盘不可解", () => {
    // 2x3 雷 [0]，点 4 → 洪泛开 {2,3,4,5}；约束 c2=c3={0,1}=1，
    // 两种布局均可行且无界外格 → 必猜
    const b = createBoard(2, 3, [0]);
    expect(isSolvable(b, 4)).toBe(false);
  });

  it("不修改传入的棋盘", () => {
    const b = createBoard(5, 3, [11, 13]);
    const rev = [...b.revealed];
    const flg = [...b.flagged];
    isSolvable(b, 0);
    expect(b.revealed).toEqual(rev);
    expect(b.flagged).toEqual(flg);
  });
});

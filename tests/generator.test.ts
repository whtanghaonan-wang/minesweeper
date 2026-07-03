import { appendFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { LEVELS, TIER_NAMES, type Tier } from "../src/core/levels";
import { generate } from "../src/core/generator";
import { mulberry32 } from "../src/core/rng";
import { isSolvable } from "../src/core/solver";
import { createBoard, neighbors } from "../src/core/board";

// 与设计文档 §4 关卡表逐项对拍
const SPEC_TABLE: [number, Tier, number, number, number, number][] = [
  [1, "easy", 8, 8, 7, 180],
  [2, "easy", 9, 10, 11, 180],
  [3, "easy", 9, 12, 14, 210],
  [4, "challenge", 10, 14, 21, 240],
  [5, "challenge", 10, 16, 26, 270],
  [6, "challenge", 11, 17, 32, 300],
  [7, "challenge", 11, 19, 37, 330],
  [8, "hard", 12, 20, 46, 330],
  [9, "hard", 12, 22, 53, 360],
  [10, "hard", 12, 24, 60, 390],
];

describe("LEVELS", () => {
  it("10 关配置与设计文档一致", () => {
    expect(LEVELS).toHaveLength(10);
    SPEC_TABLE.forEach(([id, tier, width, height, mines, timeLimitSec], i) => {
      expect(LEVELS[i]).toEqual({ id, tier, width, height, mines, timeLimitSec });
    });
  });

  it("棋盘宽度不超过 12 列（手机竖屏约束）", () => {
    for (const l of LEVELS) expect(l.width).toBeLessThanOrEqual(12);
  });

  it("三档名称齐全", () => {
    expect(TIER_NAMES.easy).toBe("简单");
    expect(TIER_NAMES.challenge).toBe("挑战");
    expect(TIER_NAMES.hard).toBe("困难");
  });
});

describe("generate", () => {
  const SEEDS: Record<Tier, number[]> = {
    easy: [1, 2, 3, 4, 5],
    challenge: [1, 2, 3, 4, 5],
    hard: [1, 2, 3],
  };

  for (const level of LEVELS) {
    it(`第 ${level.id} 关（${level.width}x${level.height}, ${level.mines} 雷）生成无猜盘`, () => {
      const first =
        Math.floor(level.height / 2) * level.width + Math.floor(level.width / 2);
      const probe = createBoard(level.width, level.height, []);
      const safeZone = new Set([first, ...neighbors(probe, first)]);

      for (const seed of SEEDS[level.tier]) {
        const t0 = performance.now();
        const b = generate(level, first, mulberry32(seed));
        const ms = performance.now() - t0;

        expect(b.mineCount).toBe(level.mines);
        expect(b.mine.filter(Boolean)).toHaveLength(level.mines);
        for (const i of safeZone) expect(b.mine[i]).toBe(false);
        expect(b.revealed.some(Boolean)).toBe(false); // 返回的是未开局的干净盘
        expect(isSolvable(b, first)).toBe(true);

        if (process.env["GEN_STATS"]) {
          appendFileSync("gen-stats.tmp.txt", `L${level.id} seed=${seed} ${ms.toFixed(0)}ms\n`);
        }
      }
    });
  }
});

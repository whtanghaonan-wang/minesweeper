import { appendFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { LEVELS, TIER_NAMES, type Tier } from "../src/core/levels";
import { generate } from "../src/core/generator";
import { mulberry32 } from "../src/core/rng";
import { isSolvable } from "../src/core/solver";
import { createBoard, neighbors } from "../src/core/board";

// 与 v2 设计文档 §1.2 关卡表逐项对拍
const SPEC_TABLE: [number, Tier, number, number, number, number][] = [
  [1, "easy", 8, 8, 7, 180],
  [2, "easy", 9, 10, 11, 180],
  [3, "easy", 9, 11, 13, 210],
  [4, "easy", 10, 12, 17, 240],
  [5, "challenge", 10, 14, 22, 270],
  [6, "challenge", 11, 15, 27, 300],
  [7, "challenge", 12, 16, 32, 330],
  [8, "challenge", 12, 18, 37, 360],
  [9, "hard", 13, 19, 45, 390],
  [10, "hard", 14, 20, 52, 420],
  [11, "hard", 14, 22, 58, 450],
  [12, "hard", 15, 23, 66, 480],
  [13, "expert", 16, 24, 77, 510],
  [14, "expert", 16, 26, 85, 540],
  [15, "expert", 17, 27, 94, 570],
  [16, "expert", 18, 28, 104, 600],
  [17, "abyss", 18, 30, 118, 660],
  [18, "abyss", 19, 31, 129, 720],
  [19, "abyss", 20, 32, 141, 780],
  [20, "abyss", 20, 34, 150, 900],
];

describe("LEVELS", () => {
  it("20 关配置与设计文档一致", () => {
    expect(LEVELS).toHaveLength(20);
    SPEC_TABLE.forEach(([id, tier, width, height, mines, timeLimitSec], i) => {
      expect(LEVELS[i]).toEqual({ id, tier, width, height, mines, timeLimitSec });
    });
  });

  it("五档名称齐全", () => {
    expect(TIER_NAMES).toEqual({
      easy: "简单",
      challenge: "挑战",
      hard: "困难",
      expert: "专家",
      abyss: "深渊",
    });
  });
});

describe("generate", () => {
  const SEEDS: Record<Tier, number[]> = {
    easy: [1, 2, 3, 4, 5],
    challenge: [1, 2, 3, 4, 5],
    hard: [1, 2, 3],
    expert: [1, 2],
    abyss: [1, 2],
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

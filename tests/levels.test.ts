import { describe, expect, it } from "vitest";
import { LEVELS, TIER_NAMES, type Tier } from "../src/core/levels";

const TIERS: Tier[] = ["easy", "challenge", "hard", "expert", "abyss"];
const density = (i: number): number =>
  (LEVELS[i]!.mines / (LEVELS[i]!.width * LEVELS[i]!.height)) * 100;

describe("v2 关卡设计律（规格 §1.2）", () => {
  it("共 20 关、编号连续、每档 4 关", () => {
    expect(LEVELS).toHaveLength(20);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
    for (const t of TIERS) expect(LEVELS.filter((l) => l.tier === t)).toHaveLength(4);
    // 档位顺序：easy → challenge → hard → expert → abyss，各自连续
    expect(LEVELS.map((l) => l.tier)).toEqual(TIERS.flatMap((t) => [t, t, t, t]));
  });

  it("档内雷密度严格单调递增", () => {
    for (let i = 1; i < 20; i++) {
      if (LEVELS[i]!.tier === LEVELS[i - 1]!.tier) {
        expect(density(i)).toBeGreaterThan(density(i - 1));
      }
    }
  });

  it("档间密度跳变 ≥ 0.9 个百分点", () => {
    for (let i = 1; i < 20; i++) {
      if (LEVELS[i]!.tier !== LEVELS[i - 1]!.tier) {
        expect(density(i) - density(i - 1)).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it("限时单调不减", () => {
    for (let i = 1; i < 20; i++) {
      expect(LEVELS[i]!.timeLimitSec).toBeGreaterThanOrEqual(LEVELS[i - 1]!.timeLimitSec);
    }
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

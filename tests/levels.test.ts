import { describe, expect, it } from "vitest";
import { LEVELS, TIER_NAMES, type Tier } from "../src/core/levels";

const OLD_TIERS: Tier[] = ["easy", "challenge", "hard", "expert", "abyss"];
const NEW_TIERS: Tier[] = ["inferno", "umbra", "void", "chaos", "finale"];
const cells = (i: number): number => LEVELS[i]!.width * LEVELS[i]!.height;
const density = (i: number): number => (LEVELS[i]!.mines / cells(i)) * 100;

describe("v2 关卡设计律(1-20,规格 §1.2 不变)", () => {
  it("前 20 关结构不变:每档 4 关、档序连续、编号连续", () => {
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
    for (const t of OLD_TIERS) expect(LEVELS.filter((l) => l.tier === t)).toHaveLength(4);
    expect(LEVELS.slice(0, 20).map((l) => l.tier)).toEqual(OLD_TIERS.flatMap((t) => [t, t, t, t]));
  });

  it("1-20 档内密度严格递增、档间跳变 ≥0.9pp、限时不减", () => {
    for (let i = 1; i < 20; i++) {
      if (LEVELS[i]!.tier === LEVELS[i - 1]!.tier) {
        expect(density(i)).toBeGreaterThan(density(i - 1));
      } else {
        expect(density(i) - density(i - 1)).toBeGreaterThanOrEqual(0.9);
      }
      expect(LEVELS[i]!.timeLimitSec).toBeGreaterThanOrEqual(LEVELS[i - 1]!.timeLimitSec);
    }
  });
});

describe("v2.1 关卡设计律(21-50,规格 §2.2)", () => {
  it("共 50 关,新五档各 6 关、档序连续", () => {
    expect(LEVELS).toHaveLength(50);
    for (const t of NEW_TIERS) expect(LEVELS.filter((l) => l.tier === t)).toHaveLength(6);
    expect(LEVELS.slice(20).map((l) => l.tier)).toEqual(
      NEW_TIERS.flatMap((t) => [t, t, t, t, t, t]),
    );
  });

  it("盘面格数与雷数严格递增(含与第 20 关衔接),竖版 h≥w", () => {
    for (let i = 20; i < 50; i++) {
      expect(cells(i)).toBeGreaterThan(cells(i - 1));
      expect(LEVELS[i]!.mines).toBeGreaterThan(LEVELS[i - 1]!.mines);
      expect(LEVELS[i]!.height).toBeGreaterThanOrEqual(LEVELS[i]!.width);
    }
  });

  it("密度带 [22.1, 23.2]、全部高于第 20 关、档均值严格递增", () => {
    for (let i = 20; i < 50; i++) {
      expect(density(i)).toBeGreaterThan(density(19));
      expect(density(i)).toBeGreaterThanOrEqual(22.1);
      expect(density(i)).toBeLessThanOrEqual(23.2);
    }
    const mean = (t: Tier): number => {
      const idx = LEVELS.map((l, i) => (l.tier === t ? i : -1)).filter((i) => i >= 0);
      return idx.reduce((s, i) => s + density(i), 0) / idx.length;
    };
    const means = NEW_TIERS.map(mean);
    expect(means[0]!).toBeGreaterThan(mean("abyss"));
    for (let k = 1; k < means.length; k++) expect(means[k]!).toBeGreaterThan(means[k - 1]!);
  });

  it("限时 21-50 严格递增,末关 1800s", () => {
    for (let i = 20; i < 50; i++) {
      expect(LEVELS[i]!.timeLimitSec).toBeGreaterThan(LEVELS[i - 1]!.timeLimitSec);
    }
    expect(LEVELS[49]!.timeLimitSec).toBe(1800);
  });

  it("十档名称齐全", () => {
    expect(TIER_NAMES).toEqual({
      easy: "简单",
      challenge: "挑战",
      hard: "困难",
      expert: "专家",
      abyss: "深渊",
      inferno: "炼狱",
      umbra: "幽冥",
      void: "虚空",
      chaos: "混沌",
      finale: "终焉",
      endless: "无尽",
    });
  });
});

import { describe, expect, it } from "vitest";
import { ENDLESS_MAX_CELLS, endlessSpec } from "../src/core/endless";
import { LEVELS } from "../src/core/levels";
import { mulberry32 } from "../src/core/rng";

describe("无尽递进曲线(v2.2 规格 §3.2)", () => {
  it("任意连胜数不超 L50 规格:格数≤1232、密度≤23.2%、h≥w、id=0、tier=endless", () => {
    const l50 = LEVELS[49]!;
    for (let streak = 0; streak <= 60; streak++) {
      for (const seed of [1, 2, 3]) {
        const s = endlessSpec(streak, mulberry32(seed));
        const cells = s.width * s.height;
        expect(cells).toBeLessThanOrEqual(l50.width * l50.height);
        expect((s.mines / cells) * 100).toBeLessThanOrEqual(23.2);
        expect(s.mines).toBeLessThanOrEqual(l50.mines);
        expect(s.height).toBeGreaterThanOrEqual(s.width);
        expect(s.mines).toBeGreaterThan(0);
        expect(s.id).toBe(0);
        expect(s.tier).toBe("endless");
      }
    }
  });

  it("固定抖动下标称曲线单调不减,第 15 胜起封顶恒定", () => {
    const at = (n: number) => endlessSpec(n, () => 0.5); // rng=0.5 → 抖动 0
    for (let n = 1; n <= 40; n++) {
      expect(at(n).width * at(n).height).toBeGreaterThanOrEqual(
        at(n - 1).width * at(n - 1).height,
      );
      expect(at(n).mines).toBeGreaterThanOrEqual(at(n - 1).mines);
      expect(at(n).timeLimitSec).toBeGreaterThanOrEqual(at(n - 1).timeLimitSec);
    }
    expect(at(15)).toEqual(at(30));
    expect(at(15).timeLimitSec).toBe(2400);
    expect(at(15).width * at(15).height).toBeLessThanOrEqual(ENDLESS_MAX_CELLS);
  });

  it("起步盘:约 600 格、密度 ≤22.1%、限时 900s", () => {
    const s = endlessSpec(0, () => 0.5);
    const cells = s.width * s.height;
    expect(cells).toBeGreaterThanOrEqual(560);
    expect(cells).toBeLessThanOrEqual(600);
    expect(s.timeLimitSec).toBe(900);
    expect((s.mines / cells) * 100).toBeLessThanOrEqual(22.1);
    expect((s.mines / cells) * 100).toBeGreaterThanOrEqual(21.5);
  });

  it("宽度随 rng 抖动 ±1,同连胜可得不同盘", () => {
    const widths = new Set([0, 0.5, 0.99].map((v) => endlessSpec(5, () => v).width));
    expect(widths.size).toBe(3);
  });
});

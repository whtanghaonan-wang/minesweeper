import { describe, expect, it, vi } from "vitest";
import {
  ENDLESS_CAP_WINS,
  ENDLESS_MAX_DENSITY,
  ENDLESS_SHAPES_BY_STREAK,
  endlessSpec,
} from "../src/core/endless";

const SPEC_CAP_WINS = 15;
const SPEC_MAX_DENSITY = 23.2;

const densityAt = (streak: number) =>
  22.1 +
  (SPEC_MAX_DENSITY - 22.1) *
    (Math.min(streak, SPEC_CAP_WINS) / SPEC_CAP_WINS);

const minesAt = (width: number, height: number, streak: number) =>
  Math.floor((width * height * densityAt(streak)) / 100);

describe("无尽递进曲线(v2.3 规格)", () => {
  it("候选表覆盖 15 个阶段且每个候选都满足尺寸与雷数上限", () => {
    expect(ENDLESS_CAP_WINS).toBe(SPEC_CAP_WINS);
    expect(ENDLESS_MAX_DENSITY).toBe(SPEC_MAX_DENSITY);
    expect(ENDLESS_SHAPES_BY_STREAK).toHaveLength(SPEC_CAP_WINS);

    ENDLESS_SHAPES_BY_STREAK.forEach((shapes, streak) => {
      expect(shapes.length).toBeGreaterThanOrEqual(2);

      for (const shape of shapes) {
        const cells = shape.width * shape.height;
        const ratio = shape.height / shape.width;

        expect(shape.width).toBeLessThan(shape.height);
        expect(ratio).toBeGreaterThanOrEqual(1.4);
        expect(ratio).toBeLessThanOrEqual(1.6);
        expect(cells).toBeLessThanOrEqual(1232);
        expect(minesAt(shape.width, shape.height, streak)).toBeLessThanOrEqual(
          285,
        );
      }
    });
  });

  it("相邻阶段任意候选组合的格数与雷数都单调不减", () => {
    for (let streak = 0; streak <= 13; streak++) {
      const current = ENDLESS_SHAPES_BY_STREAK[streak]!;
      const next = ENDLESS_SHAPES_BY_STREAK[streak + 1]!;

      for (const previousShape of current) {
        for (const nextShape of next) {
          expect(nextShape.width * nextShape.height).toBeGreaterThanOrEqual(
            previousShape.width * previousShape.height,
          );
          expect(
            minesAt(nextShape.width, nextShape.height, streak + 1),
          ).toBeGreaterThanOrEqual(
            minesAt(previousShape.width, previousShape.height, streak),
          );
        }
      }
    }
  });

  it("封顶前按随机值选择当前候选并使用精确密度与限时", () => {
    for (let streak = 0; streak <= 14; streak++) {
      for (const randomValue of [0, 0.5, 0.999999]) {
        const random = vi.fn(() => randomValue);
        const shapes = ENDLESS_SHAPES_BY_STREAK[streak];
        const expectedIndex = Math.min(
          shapes.length - 1,
          Math.floor(Math.max(0, randomValue) * shapes.length),
        );
        const expectedShape = shapes[expectedIndex]!;
        const spec = endlessSpec(streak, random);

        expect(spec.width).toBe(expectedShape.width);
        expect(spec.height).toBe(expectedShape.height);
        expect(spec.mines).toBe(minesAt(spec.width, spec.height, streak));
        expect(spec.timeLimitSec).toBe(900 + streak * 100);
        expect(random).toHaveBeenCalledTimes(1);
      }
    }
  });

  it("非有限或负连胜防御性归一到起步盘", () => {
    for (const streak of [Number.NaN, Number.POSITIVE_INFINITY, -3]) {
      const spec = endlessSpec(streak, () => 0);

      expect(spec.width).toBe(20);
      expect(spec.height).toBe(30);
      expect(spec.timeLimitSec).toBe(900);
    }
  });

  it("第 15 胜起返回固定封顶规格且不消费随机数", () => {
    for (let streak = 15; streak <= 60; streak++) {
      const rng = vi.fn(() => 0.5);

      expect(endlessSpec(streak, rng)).toEqual({
        id: 0,
        tier: "endless",
        width: 28,
        height: 44,
        mines: 285,
        timeLimitSec: 2400,
      });
      expect(rng).not.toHaveBeenCalled();
    }
  });
});

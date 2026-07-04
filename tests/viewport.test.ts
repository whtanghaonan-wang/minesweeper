import { describe, expect, it } from "vitest";
import {
  clampView,
  fitScale,
  maxScale,
  zoomAt,
  type Metrics,
} from "../src/ui/viewport";

const M: Metrics = { viewW: 600, viewH: 800, boardW: 300, boardH: 400 };

describe("视口数学", () => {
  it("fitScale 取两轴较小者，整盘恰好放入视口", () => {
    expect(fitScale(M)).toBe(2); // 600/300=2, 800/400=2
    expect(fitScale({ ...M, boardW: 600 })).toBe(1); // 600/600=1 < 800/400
    expect(fitScale({ ...M, viewW: 0 })).toBe(1); // 尺寸未知（jsdom）回退 1
  });

  it("maxScale ≥ fitScale，且保证单格可放大到 64px", () => {
    expect(maxScale(M)).toBe(2); // fit=2 > 64/40=1.6
    const small: Metrics = { viewW: 300, viewH: 300, boardW: 300, boardH: 300 };
    expect(maxScale(small)).toBeCloseTo(1.6); // fit=1 < 1.6
  });

  it("clampView：盘小于视口的轴向居中", () => {
    const v = clampView({ scale: 1, tx: -50, ty: 999 }, M); // 300x400 盘在 600x800 视口
    expect(v).toEqual({ scale: 1, tx: 150, ty: 200 });
  });

  it("clampView：盘大于视口的轴向不许露底", () => {
    const m: Metrics = { viewW: 600, viewH: 800, boardW: 400, boardH: 500 };
    const big = { scale: 2, tx: 99, ty: -9999 }; // 盘 800x1000
    expect(clampView(big, m)).toEqual({ scale: 2, tx: 0, ty: -200 }); // tx∈[-200,0], ty∈[-200,0]
  });

  it("zoomAt 不动点：缩放后指针下的盘面点不变", () => {
    // fit = min(600/800, 800/1000) = 0.75，max = max(0.75, 64/40) = 1.6
    // 起点与目标 scale 都取区间 (fit, max) 内、且远离平移钳制边界的内点，不动点性质才严格成立
    const m: Metrics = { viewW: 600, viewH: 800, boardW: 800, boardH: 1000 };
    const v0 = { scale: 1.2, tx: -100, ty: -50 };
    const v1 = zoomAt(v0, m, 100, 100, 1.25);
    expect(v1.scale).toBeCloseTo(1.5);
    // 盘面点 p = (px - tx)/s 缩放前后不变
    expect((100 - v1.tx) / v1.scale).toBeCloseTo((100 - v0.tx) / v0.scale);
    expect((100 - v1.ty) / v1.scale).toBeCloseTo((100 - v0.ty) / v0.scale);
  });

  it("zoomAt 缩放范围被钳制在 [fitScale, maxScale]", () => {
    const m: Metrics = { viewW: 600, viewH: 800, boardW: 300, boardH: 400 }; // fit=2
    expect(zoomAt({ scale: 2, tx: 0, ty: 0 }, m, 0, 0, 0.5).scale).toBe(2); // 不许缩小过 fit
    expect(zoomAt({ scale: 2, tx: 0, ty: 0 }, m, 0, 0, 100).scale).toBe(2); // max=2 封顶
  });
});

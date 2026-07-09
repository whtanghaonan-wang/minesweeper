import { describe, expect, it } from "vitest";
import {
  clampView,
  fitScale,
  maxScale,
  zoomAt,
  type Metrics,
  createGestures,
  MOUSE_SLOP_PX,
  TOUCH_SLOP_PX,
  type GestureAction,
  hitCell,
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

const types = (as: GestureAction[]): string[] => as.map((a) => a.type);

describe("手势状态机", () => {
  it("鼠标：位移小于阈值 → 抬起触发 tap(主)", () => {
    const g = createGestures();
    expect(g.handle({ type: "down", id: 1, x: 100, y: 100, touch: false, button: 0 })).toEqual([]);
    expect(g.handle({ type: "move", id: 1, x: 102, y: 101 })).toEqual([]); // 位移 ≈2.2px < 8px 阈值
    expect(g.handle({ type: "up", id: 1, x: 102, y: 101 })).toEqual([
      { type: "tap", alt: false, touch: false },
    ]);
  });

  it("鼠标：位移超阈值 → 转平移，抬起不触发 tap", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 100, y: 100, touch: false, button: 0 });
    const a = g.handle({ type: "move", id: 1, x: 100 + MOUSE_SLOP_PX, y: 100 });
    expect(a).toEqual([{ type: "pan", dx: MOUSE_SLOP_PX, dy: 0 }]);
    expect(g.handle({ type: "move", id: 1, x: 110, y: 103 })).toEqual([
      { type: "pan", dx: 110 - (100 + MOUSE_SLOP_PX), dy: 3 },
    ]);
    expect(g.handle({ type: "up", id: 1, x: 110, y: 103 })).toEqual([]);
  });

  it("鼠标右键：按下立即 tap(次)，随后的移动/抬起无动作", () => {
    const g = createGestures();
    expect(g.handle({ type: "down", id: 1, x: 5, y: 5, touch: false, button: 2 })).toEqual([
      { type: "tap", alt: true, touch: false },
    ]);
    expect(g.handle({ type: "move", id: 1, x: 50, y: 50 })).toEqual([]);
    expect(g.handle({ type: "up", id: 1, x: 50, y: 50 })).toEqual([]);
    // 冷却结束后恢复正常
    g.handle({ type: "down", id: 1, x: 0, y: 0, touch: false, button: 0 });
    expect(types(g.handle({ type: "up", id: 1, x: 0, y: 0 }))).toEqual(["tap"]);
  });

  it("触摸：按下启动长按计时；小位移点按 → cancelTimer + tap(主)", () => {
    const g = createGestures();
    expect(g.handle({ type: "down", id: 1, x: 10, y: 10, touch: true, button: 0 })).toEqual([
      { type: "startTimer" },
    ]);
    expect(g.handle({ type: "up", id: 1, x: 12, y: 10 })).toEqual([
      { type: "cancelTimer" },
      { type: "tap", alt: false, touch: true },
    ]);
  });

  it("触摸：长按到点 → tap(次)，其后抬起无动作", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 10, y: 10, touch: true, button: 0 });
    expect(g.handle({ type: "longpress" })).toEqual([{ type: "tap", alt: true, touch: true }]);
    expect(g.handle({ type: "up", id: 1, x: 10, y: 10 })).toEqual([]);
  });

  it("触摸：位移超阈值 → 取消长按并转平移，抬起不点按", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 10, y: 10, touch: true, button: 0 });
    const a = g.handle({ type: "move", id: 1, x: 10 + TOUCH_SLOP_PX, y: 10 });
    expect(a).toEqual([
      { type: "cancelTimer" },
      { type: "pan", dx: TOUCH_SLOP_PX, dy: 0 },
    ]);
    expect(g.handle({ type: "up", id: 1, x: 40, y: 10 })).toEqual([]);
    expect(g.handle({ type: "longpress" })).toEqual([]); // 迟到的计时器无害
  });

  it("双指落下即捏合：取消点按意图，产出 pinch（中点缩放+平移）", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 100, y: 100, touch: true, button: 0 });
    expect(g.handle({ type: "down", id: 2, x: 200, y: 100, touch: true, button: 0 })).toEqual([
      { type: "cancelTimer" },
    ]); // 起始距离 100，中点 (150,100)
    const a = g.handle({ type: "move", id: 2, x: 300, y: 100 }); // 距离 200，中点 (200,100)
    expect(a).toHaveLength(1);
    const p = a[0] as Extract<GestureAction, { type: "pinch" }>;
    expect(p.type).toBe("pinch");
    expect(p.factor).toBeCloseTo(2);
    expect(p.cx).toBe(200);
    expect(p.cy).toBe(100);
    expect(p.dx).toBe(50);
    expect(p.dy).toBe(0);
  });

  it("捏合后冷却：先后抬起两指都不触发点按，全部离开后才恢复", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 100, y: 100, touch: true, button: 0 });
    g.handle({ type: "down", id: 2, x: 200, y: 100, touch: true, button: 0 });
    expect(g.handle({ type: "up", id: 2, x: 200, y: 100 })).toEqual([]);
    expect(g.handle({ type: "up", id: 1, x: 100, y: 100 })).toEqual([]); // 残留指抬起也不点按
    g.handle({ type: "down", id: 3, x: 10, y: 10, touch: true, button: 0 });
    expect(types(g.handle({ type: "up", id: 3, x: 10, y: 10 }))).toEqual(["cancelTimer", "tap"]);
  });

  it("cancel 事件终止当前手势", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 10, y: 10, touch: true, button: 0 });
    expect(g.handle({ type: "cancel", id: 1 })).toEqual([{ type: "cancelTimer" }]);
    expect(g.handle({ type: "longpress" })).toEqual([]);
  });

  it("鼠标:7px 位移仍是点按(阈值 8px)", () => {
    const g = createGestures();
    g.handle({ type: "down", id: 1, x: 100, y: 100, touch: false, button: 0 });
    expect(g.handle({ type: "move", id: 1, x: 107, y: 100 })).toEqual([]);
    expect(types(g.handle({ type: "up", id: 1, x: 107, y: 100 }))).toEqual(["tap"]);
  });
});

describe("hitCell 几何吸附(v2.1 规格 §1.2)", () => {
  const V = { scale: 1, tx: 0, ty: 0 };
  // 棋盘坐标:内边距 10,格 40,缝 3,栅距 43

  it("格内命中:行列换算正确", () => {
    expect(hitCell(30, 30, V, 8, 8)).toBe(0); // 盘面(20,20) ∈ 格(0,0)
    expect(hitCell(10 + 43 + 20, 10 + 2 * 43 + 20, V, 8, 8)).toBe(17); // 列1行2
    expect(hitCell(10 + 7 * 43 + 39, 10 + 7 * 43 + 39, V, 8, 8)).toBe(63); // 末格右下角
  });

  it("缝隙吸附:距哪格近归哪格(缝宽 3 全覆盖)", () => {
    expect(hitCell(51.5, 30, V, 8, 8)).toBe(0); // 盘面 x=41.5,距格0右缘 1.5
    expect(hitCell(52.6, 30, V, 8, 8)).toBe(1); // 盘面 x=42.6,距格1左缘 0.4
    expect(hitCell(30, 51.5, V, 8, 8)).toBe(0); // 纵向缝隙同理
  });

  it("边距吸附 ≤2px,更深处返回 null", () => {
    expect(hitCell(9, 30, V, 8, 8)).toBe(0); // 盘面 x=-1,吸附首列
    expect(hitCell(7, 30, V, 8, 8)).toBeNull(); // 盘面 x=-3,超容差
    const right = 10 + 7 * 43 + 40; // 末列右缘的视口 x=351
    expect(hitCell(right + 2, 30, V, 8, 8)).toBe(7);
    expect(hitCell(right + 3, 30, V, 8, 8)).toBeNull();
  });

  it("缩放/平移变换下反算正确", () => {
    // 盘面点(30,30)=格0中心,view scale2 tx-40 ty-40 → 视口(20,20)
    expect(hitCell(20, 20, { scale: 2, tx: -40, ty: -40 }, 8, 8)).toBe(0);
    // 同一视口点在未平移 scale2 下 → 盘面坐标 x=20/2-10=0,恰在格0左缘(格内命中)
    expect(hitCell(20, 20, { scale: 2, tx: 0, ty: 0 }, 8, 8)).toBe(0);
  });

  it("完全界外返回 null", () => {
    expect(hitCell(-50, 30, V, 8, 8)).toBeNull();
    expect(hitCell(30, 9999, V, 8, 8)).toBeNull();
  });
});

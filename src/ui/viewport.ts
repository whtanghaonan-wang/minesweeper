// 视口变换与手势判定：纯逻辑、不依赖 DOM（v2 设计文档 §2）

export interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

export interface Metrics {
  viewW: number;
  viewH: number;
  boardW: number;
  boardH: number;
}

export const BASE_CELL_PX = 40;
export const MAX_CELL_PX = 64;

export const BOARD_PAD = 10;
export const CELL_GAP = 3;
const PITCH = BASE_CELL_PX + CELL_GAP;
const SNAP_PX = 2; // 缝隙/边缘吸附容差(盘面坐标系)

/** 视口坐标 → 视觉格索引:格内直接命中;缝隙与边缘 ≤SNAP_PX 吸附最近格;其余 null(留给平移)。
 *  缝宽 3 < 2×SNAP_PX+1,任何缝隙点必然吸附,命中死区为零(v2.1 设计文档 §1.2) */
export function hitCell(
  px: number,
  py: number,
  v: ViewState,
  cols: number,
  rows: number,
): number | null {
  const col = nearestIndex((px - v.tx) / v.scale - BOARD_PAD, cols);
  const row = nearestIndex((py - v.ty) / v.scale - BOARD_PAD, rows);
  if (col === null || row === null) return null;
  return row * cols + col;
}

function nearestIndex(z: number, count: number): number | null {
  const i = Math.min(count - 1, Math.max(0, Math.floor(z / PITCH)));
  if (z >= i * PITCH - SNAP_PX && z <= i * PITCH + BASE_CELL_PX + SNAP_PX) return i;
  if (i + 1 < count && (i + 1) * PITCH - z <= SNAP_PX) return i + 1;
  return null;
}

export function fitScale(m: Metrics): number {
  if (m.viewW <= 0 || m.viewH <= 0 || m.boardW <= 0 || m.boardH <= 0) return 1;
  return Math.min(m.viewW / m.boardW, m.viewH / m.boardH);
}

export function maxScale(m: Metrics): number {
  return Math.max(fitScale(m), MAX_CELL_PX / BASE_CELL_PX);
}

/** 平移钳制：盘小于视口的轴向居中，大于视口的轴向不许露底 */
export function clampView(v: ViewState, m: Metrics): ViewState {
  const bw = m.boardW * v.scale;
  const bh = m.boardH * v.scale;
  const tx = bw <= m.viewW ? (m.viewW - bw) / 2 : Math.min(0, Math.max(m.viewW - bw, v.tx));
  const ty = bh <= m.viewH ? (m.viewH - bh) / 2 : Math.min(0, Math.max(m.viewH - bh, v.ty));
  return { scale: v.scale, tx, ty };
}

/** 以视口内点 (px,py) 为不动点缩放 factor 倍，缩放范围 [fitScale, maxScale]，并钳制平移 */
export function zoomAt(
  v: ViewState,
  m: Metrics,
  px: number,
  py: number,
  factor: number,
): ViewState {
  const s = Math.min(maxScale(m), Math.max(fitScale(m), v.scale * factor));
  const k = s / v.scale;
  return clampView({ scale: s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k }, m);
}

// ===== 手势状态机（防误触，v2 设计文档 §2.2）=====

export const MOUSE_SLOP_PX = 8;
export const TOUCH_SLOP_PX = 10;

export type GestureEvent =
  | { type: "down"; id: number; x: number; y: number; touch: boolean; button: number }
  | { type: "move"; id: number; x: number; y: number }
  | { type: "up"; id: number; x: number; y: number }
  | { type: "cancel"; id: number }
  | { type: "longpress" };

export type GestureAction =
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; cx: number; cy: number; factor: number; dx: number; dy: number }
  | { type: "tap"; alt: boolean; touch: boolean }
  | { type: "startTimer" }
  | { type: "cancelTimer" };

type Pt = { x: number; y: number };
type State = "idle" | "maybeTap" | "pan" | "pinch" | "cooldown";

export function createGestures(): { handle(e: GestureEvent): GestureAction[] } {
  let state: State = "idle";
  let touch = false;
  let primaryId = -1;
  let start: Pt = { x: 0, y: 0 };
  const held = new Map<number, Pt>(); // 按下中的指针
  let pinchDist = 0;
  let pinchMid: Pt = { x: 0, y: 0 };

  const settle = (): void => {
    state = held.size > 0 ? "cooldown" : "idle";
  };

  return {
    handle(e) {
      const out: GestureAction[] = [];
      switch (e.type) {
        case "down": {
          held.set(e.id, { x: e.x, y: e.y });
          if (state === "cooldown") break;
          if (state === "idle") {
            if (!e.touch && e.button === 2) {
              out.push({ type: "tap", alt: true, touch: false }); // 右键按下即插旗
              state = "cooldown";
              break;
            }
            if (!e.touch && e.button !== 0) {
              state = "cooldown"; // 中键等其它键：无动作
              break;
            }
            state = "maybeTap";
            touch = e.touch;
            primaryId = e.id;
            start = { x: e.x, y: e.y };
            if (e.touch) out.push({ type: "startTimer" });
          } else if (touch && (state === "maybeTap" || state === "pan")) {
            // 第二根手指落下：进入捏合，取消一切点按意图
            if (state === "maybeTap") out.push({ type: "cancelTimer" });
            state = "pinch";
            const [a, b] = [...held.values()];
            pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            pinchMid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
          } else {
            if (state === "maybeTap") out.push({ type: "cancelTimer" });
            state = "cooldown"; // 鼠标按键并发等异常 → 冷却
          }
          break;
        }
        case "move": {
          const prev = held.get(e.id);
          if (!prev) break;
          held.set(e.id, { x: e.x, y: e.y });
          if (state === "maybeTap" && e.id === primaryId) {
            const slop = touch ? TOUCH_SLOP_PX : MOUSE_SLOP_PX;
            if (Math.hypot(e.x - start.x, e.y - start.y) >= slop) {
              if (touch) out.push({ type: "cancelTimer" });
              state = "pan";
              out.push({ type: "pan", dx: e.x - prev.x, dy: e.y - prev.y });
            }
          } else if (state === "pan" && e.id === primaryId) {
            out.push({ type: "pan", dx: e.x - prev.x, dy: e.y - prev.y });
          } else if (state === "pinch") {
            const [a, b] = [...held.values()];
            if (!a || !b) break;
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            out.push({
              type: "pinch",
              cx: mid.x,
              cy: mid.y,
              factor: pinchDist > 0 ? dist / pinchDist : 1,
              dx: mid.x - pinchMid.x,
              dy: mid.y - pinchMid.y,
            });
            pinchDist = dist;
            pinchMid = mid;
          }
          break;
        }
        case "up": {
          if (!held.delete(e.id)) break;
          if (state === "maybeTap" && e.id === primaryId) {
            if (touch) out.push({ type: "cancelTimer" });
            out.push({ type: "tap", alt: false, touch });
            state = "idle";
          } else {
            settle(); // pan/pinch/cooldown 抬起：捏合后残留指同样不点按
          }
          break;
        }
        case "cancel": {
          if (held.delete(e.id)) {
            if (state === "maybeTap" && touch) out.push({ type: "cancelTimer" });
            settle();
          }
          break;
        }
        case "longpress": {
          if (state === "maybeTap" && touch) {
            out.push({ type: "tap", alt: true, touch: true });
            state = "cooldown"; // 长按已消费，后续抬起不再点按
          }
          break;
        }
      }
      return out;
    },
  };
}

import type { LevelSpec } from "./levels";

// 递进曲线常量(v2.2 设计文档 §3.2):第 ENDLESS_CAP_WINS 胜起到达封顶,此后恒定极限盘。
// 封顶规格 = 新 L50(1232 格、23.2%),GEN_BENCH 对 campaign 顶端的保障自动覆盖无尽全程。
export const ENDLESS_CAP_WINS = 15;
export const ENDLESS_MIN_CELLS = 600;
export const ENDLESS_MAX_CELLS = 1232;
export const ENDLESS_MIN_DENSITY = 22.1; // %
export const ENDLESS_MAX_DENSITY = 23.2; // %
export const ENDLESS_MIN_TIME = 900; // s
export const ENDLESS_MAX_TIME = 2400; // s
const CELLS_PER_WIN = 45;
const TIME_PER_WIN = 100;
const ASPECT = 1.5; // 高瘦 ~1:1.5

/** 无尽模式下一盘参数;streak 为当前连胜数(0 = 起步盘)。
 *  不变式(配 endless.test):固定抖动下曲线单调不减、封顶后恒定;
 *  实际盘面恒满足 格数≤1232、密度≤23.2%、h≥w。 */
export function endlessSpec(streak: number, rng: () => number): LevelSpec {
  const n = Math.max(0, Math.floor(streak));
  const cells = Math.min(ENDLESS_MIN_CELLS + CELLS_PER_WIN * n, ENDLESS_MAX_CELLS);
  const density =
    ENDLESS_MIN_DENSITY +
    ((ENDLESS_MAX_DENSITY - ENDLESS_MIN_DENSITY) * Math.min(n, ENDLESS_CAP_WINS)) /
      ENDLESS_CAP_WINS;
  const timeLimitSec = Math.min(ENDLESS_MIN_TIME + TIME_PER_WIN * n, ENDLESS_MAX_TIME);
  // 宽度 ±1 随机抖动;height 向下取整保证 w*h ≤ cells ≤ 1232
  const jitter = Math.floor(rng() * 3) - 1;
  const width = Math.max(8, Math.round(Math.sqrt(cells / ASPECT)) + jitter);
  const height = Math.max(width, Math.floor(cells / width));
  const mines = Math.floor(width * height * (density / 100));
  return { id: 0, tier: "endless", width, height, mines, timeLimitSec };
}

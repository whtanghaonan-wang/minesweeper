import type { LevelSpec } from "./levels";

export const ENDLESS_CAP_WINS = 15;
export const ENDLESS_MAX_DENSITY = 23.2;
export const ENDLESS_MIN_TIME = 900;
export const ENDLESS_MAX_TIME = 2400;

export interface EndlessShape {
  readonly width: number;
  readonly height: number;
}

export const ENDLESS_SHAPES_BY_STREAK = [
  [
    { width: 20, height: 30 },
    { width: 20, height: 31 },
  ],
  [
    { width: 21, height: 30 },
    { width: 20, height: 32 },
    { width: 21, height: 31 },
  ],
  [
    { width: 21, height: 32 },
    { width: 22, height: 31 },
    { width: 21, height: 33 },
  ],
  [
    { width: 22, height: 32 },
    { width: 22, height: 33 },
    { width: 22, height: 34 },
  ],
  [
    { width: 23, height: 33 },
    { width: 22, height: 35 },
    { width: 23, height: 34 },
  ],
  [
    { width: 23, height: 35 },
    { width: 24, height: 34 },
    { width: 23, height: 36 },
  ],
  [
    { width: 24, height: 35 },
    { width: 24, height: 36 },
    { width: 25, height: 35 },
  ],
  [
    { width: 24, height: 37 },
    { width: 25, height: 36 },
    { width: 24, height: 38 },
  ],
  [
    { width: 25, height: 37 },
    { width: 25, height: 38 },
    { width: 26, height: 37 },
  ],
  [
    { width: 25, height: 39 },
    { width: 26, height: 38 },
    { width: 25, height: 40 },
  ],
  [
    { width: 26, height: 39 },
    { width: 27, height: 38 },
    { width: 26, height: 40 },
  ],
  [
    { width: 27, height: 39 },
    { width: 26, height: 41 },
    { width: 27, height: 40 },
  ],
  [
    { width: 27, height: 41 },
    { width: 28, height: 40 },
    { width: 27, height: 42 },
  ],
  [
    { width: 28, height: 41 },
    { width: 27, height: 43 },
    { width: 28, height: 42 },
  ],
  [
    { width: 28, height: 43 },
    { width: 28, height: 44 },
  ],
] as const satisfies readonly (readonly EndlessShape[])[];

function densityAt(streak: number): number {
  return (
    22.1 +
    ((ENDLESS_MAX_DENSITY - 22.1) * Math.min(streak, ENDLESS_CAP_WINS)) /
      ENDLESS_CAP_WINS
  );
}

/** 无尽模式下一盘参数；streak 为当前连胜数（0 = 起步盘）。 */
export function endlessSpec(streak: number, rng: () => number): LevelSpec {
  const n = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;

  if (n >= ENDLESS_CAP_WINS) {
    return {
      id: 0,
      tier: "endless",
      width: 28,
      height: 44,
      mines: 285,
      timeLimitSec: ENDLESS_MAX_TIME,
    };
  }

  const shapes = ENDLESS_SHAPES_BY_STREAK[n]!;
  const index = Math.min(
    Math.floor(Math.max(0, rng()) * shapes.length),
    shapes.length - 1,
  );
  const { width, height } = shapes[index]!;
  const cells = width * height;
  const mines = Math.floor((cells * densityAt(n)) / 100);
  const timeLimitSec = Math.min(
    ENDLESS_MIN_TIME + n * 100,
    ENDLESS_MAX_TIME,
  );

  return { id: 0, tier: "endless", width, height, mines, timeLimitSec };
}

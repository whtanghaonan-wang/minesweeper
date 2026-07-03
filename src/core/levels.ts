export type Tier = "easy" | "challenge" | "hard";

export interface LevelSpec {
  id: number;
  tier: Tier;
  width: number;
  height: number;
  mines: number;
  timeLimitSec: number;
}

export const TIER_NAMES: Record<Tier, string> = {
  easy: "简单",
  challenge: "挑战",
  hard: "困难",
};

/** 关卡数值唯一来源（设计文档 §4）：档间雷密度跳档，档内按比例递增，困难档限时收紧 */
export const LEVELS: LevelSpec[] = [
  { id: 1, tier: "easy", width: 8, height: 8, mines: 7, timeLimitSec: 180 },
  { id: 2, tier: "easy", width: 9, height: 10, mines: 11, timeLimitSec: 180 },
  { id: 3, tier: "easy", width: 9, height: 12, mines: 14, timeLimitSec: 210 },
  { id: 4, tier: "challenge", width: 10, height: 14, mines: 21, timeLimitSec: 240 },
  { id: 5, tier: "challenge", width: 10, height: 16, mines: 26, timeLimitSec: 270 },
  { id: 6, tier: "challenge", width: 11, height: 17, mines: 32, timeLimitSec: 300 },
  { id: 7, tier: "challenge", width: 11, height: 19, mines: 37, timeLimitSec: 330 },
  { id: 8, tier: "hard", width: 12, height: 20, mines: 46, timeLimitSec: 330 },
  { id: 9, tier: "hard", width: 12, height: 22, mines: 53, timeLimitSec: 360 },
  { id: 10, tier: "hard", width: 12, height: 24, mines: 60, timeLimitSec: 390 },
];

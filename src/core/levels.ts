export type Tier = "easy" | "challenge" | "hard" | "expert" | "abyss";

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
  expert: "专家",
  abyss: "深渊",
};

/** 关卡数值唯一来源（v2 设计文档 §1.2）：档内密度递增；专家/深渊两档密度近无猜生成可行上限，
 *  档内难度增长主要靠盘面尺寸与限时；档间密度跳变 ≥0.9 个百分点并叠加尺寸跳档 */
export const LEVELS: LevelSpec[] = [
  { id: 1, tier: "easy", width: 8, height: 8, mines: 7, timeLimitSec: 180 },
  { id: 2, tier: "easy", width: 9, height: 10, mines: 11, timeLimitSec: 180 },
  { id: 3, tier: "easy", width: 9, height: 11, mines: 13, timeLimitSec: 210 },
  { id: 4, tier: "easy", width: 10, height: 12, mines: 17, timeLimitSec: 240 },
  { id: 5, tier: "challenge", width: 10, height: 14, mines: 22, timeLimitSec: 270 },
  { id: 6, tier: "challenge", width: 11, height: 15, mines: 27, timeLimitSec: 300 },
  { id: 7, tier: "challenge", width: 12, height: 16, mines: 32, timeLimitSec: 330 },
  { id: 8, tier: "challenge", width: 12, height: 18, mines: 37, timeLimitSec: 360 },
  { id: 9, tier: "hard", width: 13, height: 19, mines: 45, timeLimitSec: 390 },
  { id: 10, tier: "hard", width: 14, height: 20, mines: 52, timeLimitSec: 420 },
  { id: 11, tier: "hard", width: 14, height: 22, mines: 58, timeLimitSec: 450 },
  { id: 12, tier: "hard", width: 15, height: 23, mines: 66, timeLimitSec: 480 },
  { id: 13, tier: "expert", width: 16, height: 24, mines: 77, timeLimitSec: 510 },
  { id: 14, tier: "expert", width: 16, height: 26, mines: 85, timeLimitSec: 540 },
  { id: 15, tier: "expert", width: 17, height: 27, mines: 94, timeLimitSec: 570 },
  { id: 16, tier: "expert", width: 18, height: 28, mines: 104, timeLimitSec: 600 },
  { id: 17, tier: "abyss", width: 18, height: 30, mines: 118, timeLimitSec: 660 },
  { id: 18, tier: "abyss", width: 19, height: 31, mines: 129, timeLimitSec: 720 },
  { id: 19, tier: "abyss", width: 20, height: 32, mines: 141, timeLimitSec: 780 },
  { id: 20, tier: "abyss", width: 20, height: 34, mines: 150, timeLimitSec: 900 },
];

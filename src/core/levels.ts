export type Tier =
  | "easy"
  | "challenge"
  | "hard"
  | "expert"
  | "abyss"
  | "inferno"
  | "umbra"
  | "void"
  | "chaos"
  | "finale";

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
  inferno: "炼狱",
  umbra: "幽冥",
  void: "虚空",
  chaos: "混沌",
  finale: "终焉",
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
  // ===== v2.1 新五档(规格 §2.2):格数/雷数严格递增,密度带 [22.1, 23.2] 内档均值缓升,
  // 限时 930s 起每关 +30s 至 1800s。盘面面积封顶 950 格、密度贴近下限,以通过 GEN_BENCH 生成
  // 性能闸门(21-50 每关 5 种子单盘 <500ms);任何调整必须同时通过 levels.test 不变式与该闸门 =====
  { id: 21, tier: "inferno", width: 22, height: 32, mines: 156, timeLimitSec: 930 },
  { id: 22, tier: "inferno", width: 23, height: 31, mines: 158, timeLimitSec: 960 },
  { id: 23, tier: "inferno", width: 24, height: 30, mines: 160, timeLimitSec: 990 },
  { id: 24, tier: "inferno", width: 22, height: 33, mines: 161, timeLimitSec: 1020 },
  { id: 25, tier: "inferno", width: 21, height: 35, mines: 163, timeLimitSec: 1050 },
  { id: 26, tier: "inferno", width: 24, height: 31, mines: 165, timeLimitSec: 1080 },
  { id: 27, tier: "umbra", width: 25, height: 30, mines: 167, timeLimitSec: 1110 },
  { id: 28, tier: "umbra", width: 23, height: 33, mines: 169, timeLimitSec: 1140 },
  { id: 29, tier: "umbra", width: 24, height: 32, mines: 171, timeLimitSec: 1170 },
  { id: 30, tier: "umbra", width: 25, height: 31, mines: 172, timeLimitSec: 1200 },
  { id: 31, tier: "umbra", width: 23, height: 34, mines: 174, timeLimitSec: 1230 },
  { id: 32, tier: "umbra", width: 24, height: 33, mines: 176, timeLimitSec: 1260 },
  { id: 33, tier: "void", width: 23, height: 35, mines: 179, timeLimitSec: 1290 },
  { id: 34, tier: "void", width: 22, height: 37, mines: 181, timeLimitSec: 1320 },
  { id: 35, tier: "void", width: 25, height: 33, mines: 184, timeLimitSec: 1350 },
  { id: 36, tier: "void", width: 23, height: 36, mines: 185, timeLimitSec: 1380 },
  { id: 37, tier: "void", width: 24, height: 35, mines: 187, timeLimitSec: 1410 },
  { id: 38, tier: "void", width: 25, height: 34, mines: 189, timeLimitSec: 1440 },
  { id: 39, tier: "chaos", width: 26, height: 33, mines: 192, timeLimitSec: 1470 },
  { id: 40, tier: "chaos", width: 24, height: 36, mines: 193, timeLimitSec: 1500 },
  { id: 41, tier: "chaos", width: 23, height: 38, mines: 195, timeLimitSec: 1530 },
  { id: 42, tier: "chaos", width: 26, height: 34, mines: 198, timeLimitSec: 1560 },
  { id: 43, tier: "chaos", width: 27, height: 33, mines: 199, timeLimitSec: 1590 },
  { id: 44, tier: "chaos", width: 23, height: 39, mines: 201, timeLimitSec: 1620 },
  { id: 45, tier: "finale", width: 26, height: 35, mines: 204, timeLimitSec: 1650 },
  { id: 46, tier: "finale", width: 27, height: 34, mines: 206, timeLimitSec: 1680 },
  { id: 47, tier: "finale", width: 25, height: 37, mines: 207, timeLimitSec: 1710 },
  { id: 48, tier: "finale", width: 26, height: 36, mines: 209, timeLimitSec: 1740 },
  { id: 49, tier: "finale", width: 23, height: 41, mines: 212, timeLimitSec: 1770 },
  { id: 50, tier: "finale", width: 25, height: 38, mines: 214, timeLimitSec: 1800 },
];

import type { LevelSpec, Tier } from "../core/levels";

export interface VinePoint {
  x: number;
  y: number;
}
export interface VineNode extends VinePoint {
  levelId: number;
}
export interface VineSegment {
  tier: Tier;
  points: VinePoint[];
}
export interface VineLayout {
  width: number;
  height: number;
  nodes: VineNode[];
  segments: VineSegment[];
}

export const VINE_W = 260;
const STEP_Y = 64;
const AMP = 80;
const CX = 130;
const PAD_TOP = 70;
const PAD_BOTTOM = 56;
const PERIOD = 10; // 每 10 关摆动一个来回

/** 蜿蜒藤蔓布局：第 1 关在最底部（根），难度越深位置越高（v2 设计文档 §3） */
export function vineLayout(levels: LevelSpec[]): VineLayout {
  const n = levels.length;
  const height = PAD_TOP + (n - 1) * STEP_Y + PAD_BOTTOM;
  const nodes: VineNode[] = levels.map((l, i) => ({
    levelId: l.id,
    x: Math.round(CX - AMP * Math.cos((i * 2 * Math.PI) / PERIOD)),
    y: PAD_TOP + (n - 1 - i) * STEP_Y,
  }));

  const segments: VineSegment[] = [];
  for (let i = 0; i < n; ) {
    const tier = levels[i]!.tier;
    let j = i;
    while (j < n && levels[j]!.tier === tier) j++;
    // 含下一档首节点，使相邻色带在拐点处相接
    const points = nodes.slice(i, Math.min(j + 1, n)).map(({ x, y }) => ({ x, y }));
    segments.push({ tier, points });
    i = j;
  }
  return { width: VINE_W, height, nodes, segments };
}

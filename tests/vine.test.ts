import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/core/levels";
import { vineLayout, VINE_W } from "../src/ui/vine";

describe("vineLayout", () => {
  const L = vineLayout(LEVELS);

  it("每关一个节点，第 1 关在最底部，越深越高（y 严格递减）", () => {
    expect(L.nodes).toHaveLength(20);
    expect(L.nodes[0]!.levelId).toBe(1);
    for (let i = 1; i < L.nodes.length; i++) {
      expect(L.nodes[i]!.y).toBeLessThan(L.nodes[i - 1]!.y);
    }
  });

  it("节点横向在藤蔓摆动范围内，纵向留了上下边距", () => {
    for (const n of L.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(130 - 80);
      expect(n.x).toBeLessThanOrEqual(130 + 80);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(L.height);
    }
    expect(L.width).toBe(VINE_W);
  });

  it("色带按档分段、相邻段共享边界点（拐点相接）", () => {
    expect(L.segments.map((s) => s.tier)).toEqual(["easy", "challenge", "hard", "expert", "abyss"]);
    for (let i = 1; i < L.segments.length; i++) {
      const prev = L.segments[i - 1]!.points;
      expect(prev[prev.length - 1]).toEqual(L.segments[i]!.points[0]);
    }
    // 每段 = 本档 4 节点 + 下一档首节点（末段除外）
    expect(L.segments[0]!.points).toHaveLength(5);
    expect(L.segments[4]!.points).toHaveLength(4);
  });
});

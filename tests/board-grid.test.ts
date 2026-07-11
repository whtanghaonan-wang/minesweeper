import { describe, expect, it } from "vitest";
import {
  cellAriaLabel,
  createBoardLayout,
  gridKeyTarget,
  selectCascadeCells,
  toLogicalIndex,
  toVisualIndex,
} from "../src/ui/board-grid";

describe("board-grid", () => {
  it("纵横布局的视觉/逻辑索引双向互逆", () => {
    for (const wide of [false, true]) {
      const layout = createBoardLayout(3, 5, wide);
      for (let logical = 0; logical < 15; logical++) {
        expect(toLogicalIndex(toVisualIndex(logical, layout), layout)).toBe(logical);
      }
      expect([layout.cols, layout.rows]).toEqual(wide ? [5, 3] : [3, 5]);
    }

    const wide = createBoardLayout(3, 5, true);
    expect(toVisualIndex(1, wide)).toBe(5);
    expect(toLogicalIndex(5, wide)).toBe(1);
    expect(toVisualIndex(3, wide)).toBe(1);
    expect(toLogicalIndex(1, wide)).toBe(3);
  });

  it("方向、Home/End 与 Ctrl+Home/End 按视觉网格移动", () => {
    expect(gridKeyTarget(4, "ArrowLeft", false, 3, 3)).toBe(3);
    expect(gridKeyTarget(4, "ArrowRight", false, 3, 3)).toBe(5);
    expect(gridKeyTarget(4, "ArrowUp", false, 3, 3)).toBe(1);
    expect(gridKeyTarget(4, "ArrowDown", false, 3, 3)).toBe(7);
    expect(gridKeyTarget(4, "Home", false, 3, 3)).toBe(3);
    expect(gridKeyTarget(4, "End", false, 3, 3)).toBe(5);
    expect(gridKeyTarget(4, "Home", true, 3, 3)).toBe(0);
    expect(gridKeyTarget(4, "End", true, 3, 3)).toBe(8);
    expect(gridKeyTarget(0, "ArrowLeft", false, 3, 3)).toBe(0);
    expect(gridKeyTarget(0, "x", false, 3, 3)).toBeNull();
  });

  it("非方形视觉网格在四边按方向键保持原位", () => {
    expect(gridKeyTarget(5, "ArrowLeft", false, 5, 3)).toBe(5);
    expect(gridKeyTarget(4, "ArrowRight", false, 5, 3)).toBe(4);
    expect(gridKeyTarget(2, "ArrowUp", false, 5, 3)).toBe(2);
    expect(gridKeyTarget(12, "ArrowDown", false, 5, 3)).toBe(12);
  });

  it("格子标签覆盖全部公开状态，不泄漏活动局未揭开雷", () => {
    const hidden = cellAriaLabel(2, 4, { kind: "hidden" });
    const flagged = cellAriaLabel(2, 4, { kind: "flagged" });
    expect(hidden).toBe("第 2 行，第 4 列，未揭开");
    expect(flagged).toBe("第 2 行，第 4 列，已插旗");
    expect(hidden).not.toContain("雷");
    expect(flagged).not.toContain("雷");
    expect(cellAriaLabel(2, 4, { kind: "open", adjacent: 0 })).toBe("第 2 行，第 4 列，已揭开，空白");
    expect(cellAriaLabel(2, 4, { kind: "open", adjacent: 3 })).toBe("第 2 行，第 4 列，已揭开，周围 3 颗雷");
    expect(cellAriaLabel(2, 4, { kind: "mine" })).toBe("第 2 行，第 4 列，雷");
    expect(cellAriaLabel(2, 4, { kind: "exploded" })).toBe("第 2 行，第 4 列，已触发的雷");
    expect(cellAriaLabel(2, 4, { kind: "wrong-flag" })).toBe("第 2 行，第 4 列，错误旗帜");
    expect(cellAriaLabel(2, 4, { kind: "safe-hidden" })).toBe("第 2 行，第 4 列，未揭开的安全格");
  });

  it("级联只取可视格，按曼哈顿距离/逻辑索引排序且最多 64 个", () => {
    const changed = Array.from({ length: 100 }, (_, i) => i);
    const unchanged = [...changed];
    const selected = selectCascadeCells(changed, 55, 10, (i) => i >= 20);
    expect(selected).toHaveLength(64);
    expect(selected[0]).toBe(55);
    expect(selected.every((i) => i >= 20)).toBe(true);
    expect(changed).toEqual(unchanged);
    const tie = selectCascadeCells([46, 54, 56, 64], 55, 10, () => true, 64);
    expect(tie).toEqual([54, 56, 46, 64]);
  });
});

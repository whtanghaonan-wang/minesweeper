export interface BoardLayout {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly wide: boolean;
  readonly cols: number;
  readonly rows: number;
}

export type CellA11yState =
  | { kind: "hidden" }
  | { kind: "flagged" }
  | { kind: "open"; adjacent: number }
  | { kind: "mine" }
  | { kind: "exploded" }
  | { kind: "wrong-flag" }
  | { kind: "safe-hidden" };

export function createBoardLayout(
  logicalWidth: number,
  logicalHeight: number,
  wide: boolean,
): BoardLayout {
  return {
    logicalWidth,
    logicalHeight,
    wide,
    cols: wide ? logicalHeight : logicalWidth,
    rows: wide ? logicalWidth : logicalHeight,
  };
}

export function toLogicalIndex(visual: number, layout: BoardLayout): number {
  if (!layout.wide) return visual;
  const x = visual % layout.cols;
  const y = Math.floor(visual / layout.cols);
  return x * layout.logicalWidth + y;
}

export function toVisualIndex(logical: number, layout: BoardLayout): number {
  if (!layout.wide) return logical;
  const x = logical % layout.logicalWidth;
  const y = Math.floor(logical / layout.logicalWidth);
  return x * layout.cols + y;
}

export function gridKeyTarget(
  current: number,
  key: string,
  ctrl: boolean,
  cols: number,
  rows: number,
): number | null {
  const last = cols * rows - 1;
  const col = current % cols;
  switch (key) {
    case "ArrowLeft": return col === 0 ? current : current - 1;
    case "ArrowRight": return col === cols - 1 ? current : current + 1;
    case "ArrowUp": return current < cols ? current : current - cols;
    case "ArrowDown": return current + cols > last ? current : current + cols;
    case "Home": return ctrl ? 0 : current - col;
    case "End": return ctrl ? last : current - col + cols - 1;
    default: return null;
  }
}

export function cellAriaLabel(row: number, col: number, state: CellA11yState): string {
  const prefix = `第 ${row} 行，第 ${col} 列，`;
  switch (state.kind) {
    case "hidden": return `${prefix}未揭开`;
    case "flagged": return `${prefix}已插旗`;
    case "open": return state.adjacent === 0
      ? `${prefix}已揭开，空白`
      : `${prefix}已揭开，周围 ${state.adjacent} 颗雷`;
    case "mine": return `${prefix}雷`;
    case "exploded": return `${prefix}已触发的雷`;
    case "wrong-flag": return `${prefix}错误旗帜`;
    case "safe-hidden": return `${prefix}未揭开的安全格`;
  }
}

export function selectCascadeCells(
  changedLogical: readonly number[],
  originLogical: number,
  logicalWidth: number,
  isVisible: (logical: number) => boolean,
  limit = 64,
): number[] {
  const ox = originLogical % logicalWidth;
  const oy = Math.floor(originLogical / logicalWidth);
  return changedLogical
    .filter(isVisible)
    .sort((a, b) => {
      const ad = Math.abs((a % logicalWidth) - ox) +
        Math.abs(Math.floor(a / logicalWidth) - oy);
      const bd = Math.abs((b % logicalWidth) - ox) +
        Math.abs(Math.floor(b / logicalWidth) - oy);
      return ad - bd || a - b;
    })
    .slice(0, limit);
}

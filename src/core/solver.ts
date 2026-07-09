import { type Board, neighbors, reveal, isWin } from "./board";

interface Constraint {
  cells: number[];
  mines: number;
}

interface ComponentResult {
  alwaysMine: number[];
  alwaysSafe: number[];
  minCount: number;
  maxCount: number;
}

/**
 * 判定盘面能否从 firstIdx 出发全程纯逻辑推完（无猜）。
 * 推理层级：基础规则 → 子集推理 → 全局终局 → 边界穷举 + 全局雷数计数。
 * 不修改传入的 board。maxComponent 为穷举的连通块大小上限（0 = 禁用穷举）。
 */
export function isSolvable(board: Board, firstIdx: number, maxComponent = 24): boolean {
  const size = board.width * board.height;
  const b: Board = {
    ...board,
    revealed: new Array<boolean>(size).fill(false),
    flagged: new Array<boolean>(size).fill(false),
  };

  if (b.mine[firstIdx]) return false;
  reveal(b, firstIdx);

  while (!isWin(b)) {
    if (!step(b, maxComponent)) return false;
  }
  return true;
}

/** 执行一轮推理；有任何新格被揭开或标雷返回 true，无进展返回 false。 */
function step(b: Board, maxComponent: number): boolean {
  const size = b.width * b.height;

  const constraints: Constraint[] = [];
  for (let i = 0; i < size; i++) {
    if (!b.revealed[i] || b.adjacent[i] === 0) continue;
    const ns = neighbors(b, i);
    const unknown = ns.filter((n) => !b.revealed[n] && !b.flagged[n]);
    if (unknown.length === 0) continue;
    const mines = b.adjacent[i] - ns.filter((n) => b.flagged[n]).length;
    constraints.push({ cells: unknown, mines });
  }

  const unknownAll: number[] = [];
  let flaggedTotal = 0;
  for (let i = 0; i < size; i++) {
    if (b.flagged[i]) flaggedTotal++;
    else if (!b.revealed[i]) unknownAll.push(i);
  }
  const minesLeft = b.mineCount - flaggedTotal;

  const toReveal = new Set<number>();
  const toFlag = new Set<number>();

  // 全局终局
  if (minesLeft === 0) unknownAll.forEach((i) => toReveal.add(i));
  else if (unknownAll.length === minesLeft) unknownAll.forEach((i) => toFlag.add(i));

  // 基础规则
  for (const c of constraints) {
    if (c.mines === 0) c.cells.forEach((i) => toReveal.add(i));
    else if (c.mines === c.cells.length) c.cells.forEach((i) => toFlag.add(i));
  }

  // 子集推理：A ⊆ B → (B−A) 的雷数 = B.mines − A.mines
  // 性能:A ⊆ C 必共享 A 的首格,只对共享首格的约束对检查;成员集每约束每轮建一次。
  // 推导结果与全配对检查完全一致(v2.2 规格 §1.3:规则集冻结,仅提速)。
  if (toReveal.size === 0 && toFlag.size === 0) {
    const sets = constraints.map((c) => new Set(c.cells));
    const byCell = new Map<number, number[]>();
    constraints.forEach((c, ci) => {
      for (const x of c.cells) {
        let list = byCell.get(x);
        if (!list) byCell.set(x, (list = []));
        list.push(ci);
      }
    });
    constraints.forEach((a, ai) => {
      for (const ci of byCell.get(a.cells[0]!) ?? []) {
        if (ci === ai) continue;
        const c = constraints[ci]!;
        if (a.cells.length >= c.cells.length) continue;
        const cSet = sets[ci]!;
        if (!a.cells.every((x) => cSet.has(x))) continue;
        const aSet = sets[ai]!;
        const diff = c.cells.filter((x) => !aSet.has(x));
        const diffMines = c.mines - a.mines;
        if (diffMines === 0) diff.forEach((i) => toReveal.add(i));
        else if (diffMines === diff.length) diff.forEach((i) => toFlag.add(i));
      }
    });
  }

  // 边界穷举 + 全局雷数计数
  if (toReveal.size === 0 && toFlag.size === 0) {
    const components = splitComponents(constraints);
    const frontierTotal = components.reduce((s, c) => s + c.cells.length, 0);
    const outside = unknownAll.length - frontierTotal; // 非边界未知格数

    let minSum = 0;
    let maxSum = 0;
    for (const comp of components) {
      if (comp.cells.length > maxComponent || maxComponent === 0) {
        maxSum += Math.min(comp.cells.length, minesLeft);
        continue;
      }
      const res = enumerateComponent(
        comp.cells,
        comp.constraints,
        minesLeft,
        unknownAll.length - comp.cells.length,
      );
      if (!res) return false; // 理论上不可达（真实布局必可行）
      res.alwaysMine.forEach((i) => toFlag.add(i));
      res.alwaysSafe.forEach((i) => toReveal.add(i));
      minSum += res.minCount;
      maxSum += res.maxCount;
    }

    if (outside > 0 && toReveal.size === 0 && toFlag.size === 0) {
      const frontier = new Set<number>();
      components.forEach((c) => c.cells.forEach((i) => frontier.add(i)));
      const outsideCells = unknownAll.filter((i) => !frontier.has(i));
      const lo = Math.max(minSum, minesLeft - outside); // 边界内雷数的可行下界
      const hi = Math.min(maxSum, minesLeft); // 可行上界
      if (lo === minesLeft) outsideCells.forEach((i) => toReveal.add(i)); // 雷全在边界
      else if (hi === minesLeft - outside) outsideCells.forEach((i) => toFlag.add(i)); // 界外全雷
    }
  }

  let progress = false;
  for (const i of toFlag) {
    if (!b.flagged[i] && !b.revealed[i]) {
      // 健全性哨兵：推理规则若把非雷格判成雷，说明求解器有缺陷，必须立刻暴露
      if (!b.mine[i]) throw new Error(`solver unsound: flagged non-mine cell ${i}`);
      b.flagged[i] = true;
      progress = true;
    }
  }
  for (const i of toReveal) {
    if (!b.revealed[i] && !b.flagged[i]) {
      const r = reveal(b, i);
      if (r.exploded) throw new Error(`solver unsound: revealed mine cell ${i}`);
      if (r.changed.length > 0) progress = true;
    }
  }
  return progress;
}

/** 按共享约束把边界未知格分成连通块。 */
function splitComponents(
  constraints: Constraint[],
): { cells: number[]; constraints: Constraint[] }[] {
  const cellCons = new Map<number, Constraint[]>();
  for (const c of constraints) {
    for (const i of c.cells) {
      let list = cellCons.get(i);
      if (!list) cellCons.set(i, (list = []));
      list.push(c);
    }
  }
  const seen = new Set<number>();
  const out: { cells: number[]; constraints: Constraint[] }[] = [];
  for (const start of cellCons.keys()) {
    if (seen.has(start)) continue;
    const cells: number[] = [];
    const cons = new Set<Constraint>();
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const cur = queue.pop()!;
      cells.push(cur);
      for (const c of cellCons.get(cur)!) {
        if (cons.has(c)) continue;
        cons.add(c);
        for (const n of c.cells) {
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
    }
    out.push({ cells, constraints: [...cons] });
  }
  return out;
}

/**
 * 带剪枝回溯枚举连通块内所有满足约束且全局雷数可行的布雷方案，
 * 返回恒雷格、恒安全格及块内雷数的可行范围。
 */
function enumerateComponent(
  cells: number[],
  constraints: Constraint[],
  minesLeft: number,
  outsideCapacity: number,
): ComponentResult | null {
  const n = cells.length;
  const localIdx = new Map<number, number>();
  cells.forEach((c, i) => localIdx.set(c, i));

  // 每格所属约束、每约束的局部格列表
  const consLocal = constraints.map((c) => ({
    cells: c.cells.map((x) => localIdx.get(x)!),
    mines: c.mines,
    assignedMines: 0,
    assignedCells: 0,
  }));
  const cellCons: number[][] = cells.map(() => []);
  consLocal.forEach((c, ci) => c.cells.forEach((li) => cellCons[li]!.push(ci)));

  const assign = new Array<0 | 1>(n).fill(0);
  const alwaysMine = new Array<boolean>(n).fill(true);
  const alwaysSafe = new Array<boolean>(n).fill(true);
  let minCount = Infinity;
  let maxCount = -Infinity;
  let found = false;

  const dfs = (pos: number, mines: number): void => {
    if (pos === n) {
      if (minesLeft - mines > outsideCapacity) return; // 剩余雷放不进块外
      found = true;
      minCount = Math.min(minCount, mines);
      maxCount = Math.max(maxCount, mines);
      for (let i = 0; i < n; i++) {
        if (assign[i] === 1) alwaysSafe[i] = false;
        else alwaysMine[i] = false;
      }
      return;
    }
    for (const v of [0, 1] as const) {
      if (v === 1 && mines >= minesLeft) continue;
      assign[pos] = v;
      let ok = true;
      for (const ci of cellCons[pos]!) {
        const c = consLocal[ci]!;
        c.assignedCells++;
        c.assignedMines += v;
        if (
          c.assignedMines > c.mines ||
          c.mines - c.assignedMines > c.cells.length - c.assignedCells
        ) {
          ok = false;
        }
      }
      if (ok) dfs(pos + 1, mines + v);
      for (const ci of cellCons[pos]!) {
        const c = consLocal[ci]!;
        c.assignedCells--;
        c.assignedMines -= v;
      }
    }
  };
  dfs(0, 0);

  if (!found) return null;
  return {
    alwaysMine: cells.filter((_, i) => alwaysMine[i]),
    alwaysSafe: cells.filter((_, i) => alwaysSafe[i]),
    minCount,
    maxCount,
  };
}

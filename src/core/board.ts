export interface Board {
  width: number;
  height: number;
  mineCount: number;
  mine: boolean[];
  adjacent: number[];
  revealed: boolean[];
  flagged: boolean[];
}

export interface RevealResult {
  exploded: boolean;
  changed: number[];
}

const NO_OP: RevealResult = { exploded: false, changed: [] };

export function neighbors(b: Board, i: number): number[] {
  const x = i % b.width;
  const y = Math.floor(i / b.width);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < b.width && ny >= 0 && ny < b.height) {
        out.push(ny * b.width + nx);
      }
    }
  }
  return out;
}

export function createBoard(width: number, height: number, mineIdxs: number[]): Board {
  const size = width * height;
  const mine = new Array<boolean>(size).fill(false);
  for (const i of mineIdxs) mine[i] = true;
  const b: Board = {
    width,
    height,
    mineCount: mineIdxs.length,
    mine,
    adjacent: new Array<number>(size).fill(0),
    revealed: new Array<boolean>(size).fill(false),
    flagged: new Array<boolean>(size).fill(false),
  };
  for (let i = 0; i < size; i++) {
    if (b.mine[i]) continue;
    b.adjacent[i] = neighbors(b, i).filter((n) => b.mine[n]).length;
  }
  return b;
}

/** 挖开一格；0 格洪泛展开。旗格/已开格为无操作。 */
export function reveal(b: Board, i: number): RevealResult {
  if (b.revealed[i] || b.flagged[i]) return NO_OP;
  if (b.mine[i]) {
    b.revealed[i] = true;
    return { exploded: true, changed: [i] };
  }
  const changed: number[] = [];
  const stack = [i];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (b.revealed[cur] || b.flagged[cur]) continue;
    b.revealed[cur] = true;
    changed.push(cur);
    if (b.adjacent[cur] === 0) {
      for (const n of neighbors(b, cur)) {
        if (!b.revealed[n] && !b.flagged[n] && !b.mine[n]) stack.push(n);
      }
    }
  }
  return { exploded: false, changed };
}

/** 插旗/拔旗；已开格无操作。返回该格当前是否插旗。 */
export function toggleFlag(b: Board, i: number): boolean {
  if (b.revealed[i]) return false;
  b.flagged[i] = !b.flagged[i];
  return b.flagged[i];
}

/** 已开数字格且周围旗数等于数字时，展开其余未旗未开邻格。 */
export function chord(b: Board, i: number): RevealResult {
  if (!b.revealed[i] || b.adjacent[i] === 0) return NO_OP;
  const ns = neighbors(b, i);
  const flags = ns.filter((n) => b.flagged[n]).length;
  if (flags !== b.adjacent[i]) return NO_OP;
  let exploded = false;
  const changed: number[] = [];
  for (const n of ns) {
    if (b.revealed[n] || b.flagged[n]) continue;
    const r = reveal(b, n);
    exploded ||= r.exploded;
    changed.push(...r.changed);
  }
  return { exploded, changed };
}

export function isWin(b: Board): boolean {
  for (let i = 0; i < b.mine.length; i++) {
    if (!b.mine[i] && !b.revealed[i]) return false;
  }
  return true;
}

export function flaggedCount(b: Board): number {
  return b.flagged.filter(Boolean).length;
}

import { describe, it, expect } from "vitest";
import {
  createBoard,
  neighbors,
  reveal,
  toggleFlag,
  chord,
  isWin,
  flaggedCount,
} from "../src/core/board";

// 固定 4x4 盘，雷在 idx 0 和 5：
// M 1 . .        adjacent: [_,2,1,0,
// 2 M 1 .                   2,_,1,0,
// 1 1 1 .                   1,1,1,0,
// . . . .                   0,0,0,0]
const mk = () => createBoard(4, 4, [0, 5]);

describe("neighbors", () => {
  it("角格 3 邻居、边格 5 邻居、中格 8 邻居", () => {
    expect(neighbors(mk(), 0)).toHaveLength(3);
    expect(neighbors(mk(), 1)).toHaveLength(5);
    expect(neighbors(mk(), 5)).toHaveLength(8);
  });
});

describe("createBoard", () => {
  it("adjacent 计数正确", () => {
    const b = mk();
    expect(b.adjacent[1]).toBe(2);
    expect(b.adjacent[4]).toBe(2);
    expect(b.adjacent[10]).toBe(1);
    expect(b.adjacent[15]).toBe(0);
    expect(b.mineCount).toBe(2);
  });
});

describe("reveal", () => {
  it("挖到雷爆炸", () => {
    expect(reveal(mk(), 0).exploded).toBe(true);
  });

  it("挖 0 格洪泛展开到数字边界", () => {
    const b = mk();
    const r = reveal(b, 15);
    expect(r.exploded).toBe(false);
    // 右下整片 0 区 + 边界数字全开
    expect(b.revealed[15]).toBe(true);
    expect(b.revealed[3]).toBe(true);
    expect(b.revealed[10]).toBe(true);
    expect(b.revealed[8]).toBe(true);
    // 雷不开
    expect(b.revealed[0]).toBe(false);
    expect(b.revealed[5]).toBe(false);
    // changed 列表与实际揭开一致
    expect(r.changed.length).toBe(b.revealed.filter(Boolean).length);
  });

  it("挖数字格只开一格", () => {
    const b = mk();
    const r = reveal(b, 1);
    expect(r.changed).toEqual([1]);
  });

  it("旗格与已开格不可挖", () => {
    const b = mk();
    toggleFlag(b, 0);
    expect(reveal(b, 0).changed).toHaveLength(0);
    expect(reveal(b, 0).exploded).toBe(false);
    reveal(b, 1);
    expect(reveal(b, 1).changed).toHaveLength(0);
  });
});

describe("toggleFlag", () => {
  it("插旗/拔旗往返，已开格不可插旗", () => {
    const b = mk();
    expect(toggleFlag(b, 0)).toBe(true);
    expect(flaggedCount(b)).toBe(1);
    expect(toggleFlag(b, 0)).toBe(false);
    expect(flaggedCount(b)).toBe(0);
    reveal(b, 15);
    expect(toggleFlag(b, 15)).toBe(false);
    expect(b.flagged[15]).toBe(false);
  });
});

describe("chord", () => {
  it("旗数匹配时展开其余邻格", () => {
    const b = mk();
    reveal(b, 2); // 数字 1
    toggleFlag(b, 5); // 旗在真雷上
    const r = chord(b, 2);
    expect(r.exploded).toBe(false);
    expect(b.revealed[1]).toBe(true);
    expect(b.revealed[6]).toBe(true);
    expect(b.revealed[3]).toBe(true);
  });

  it("插错旗 chord 会爆", () => {
    const b = mk();
    reveal(b, 2);
    toggleFlag(b, 6); // 错旗
    expect(chord(b, 2).exploded).toBe(true);
  });

  it("旗数不匹配或未开格 chord 无操作", () => {
    const b = mk();
    reveal(b, 2);
    expect(chord(b, 2).changed).toHaveLength(0); // 0 旗 ≠ 数字 1
    expect(chord(b, 9).changed).toHaveLength(0); // 未开格
    reveal(b, 15);
    expect(chord(b, 15).changed).toHaveLength(0); // 0 格
  });
});

describe("isWin", () => {
  it("全部非雷格开完为胜（与插旗无关）", () => {
    const b = mk();
    for (let i = 0; i < 16; i++) if (!b.mine[i]) reveal(b, i);
    expect(isWin(b)).toBe(true);
  });

  it("尚有未开非雷格不算胜", () => {
    const b = mk();
    reveal(b, 15);
    expect(isWin(b)).toBe(false);
  });
});

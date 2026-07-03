/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoard } from "../src/core/board";
import { LEVELS } from "../src/core/levels";
import { createStorage } from "../src/core/storage";
import { showMenu } from "../src/ui/menu";
import { showGame } from "../src/ui/game";
import { showResult } from "../src/ui/result";

// 游戏页测试用固定盘面：第 1 关 8x8，雷在顶行前 7 格
vi.mock("../src/core/generator", () => ({
  generate: (level: { width: number; height: number }) =>
    createBoard(level.width, level.height, [0, 1, 2, 3, 4, 5, 6]),
}));

function memBackend() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function mouse(el: Element, type: string, button = 0): void {
  const e = new MouseEvent(type, { bubbles: true, button });
  Object.defineProperty(e, "pointerType", { value: "mouse" });
  el.dispatchEvent(e);
}

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("div");
  document.body.appendChild(root);
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("选关页", () => {
  it("渲染 10 个关卡，仅第 1 关可玩，其余锁定", () => {
    showMenu(root, { storage: createStorage(memBackend()), onPlay: () => {} });
    const tiles = root.querySelectorAll<HTMLButtonElement>(".level-tile");
    expect(tiles).toHaveLength(10);
    expect(tiles[0]!.disabled).toBe(false);
    for (let i = 1; i < 10; i++) expect(tiles[i]!.disabled).toBe(true);
  });

  it("显示最好成绩并可进入已解锁关卡", () => {
    const storage = createStorage(memBackend());
    storage.recordWin(1, 83);
    const played: number[] = [];
    showMenu(root, { storage, onPlay: (l) => played.push(l.id) });
    const tiles = root.querySelectorAll<HTMLButtonElement>(".level-tile");
    expect(tiles[0]!.textContent).toContain("1:23");
    expect(tiles[1]!.disabled).toBe(false); // 已解锁第 2 关
    tiles[1]!.click();
    expect(played).toEqual([2]);
  });
});

describe("游戏页", () => {
  const level = LEVELS[0]!; // 8x8, 7 雷（mock 后雷在 0..6）

  function start(onFinish: (r: unknown) => void = () => {}) {
    vi.useFakeTimers();
    // 竖屏窗口，避免触发宽屏行列转置，保证视觉索引 == 逻辑索引
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    showGame(root, { level, onExit: () => {}, onFinish: onFinish as never });
    return root.querySelectorAll<HTMLButtonElement>(".cell");
  }

  it("首次点击生成盘面并揭开", () => {
    const cells = start();
    expect(cells).toHaveLength(64);
    mouse(cells[63]!, "pointerdown"); // 右下角远离雷区
    expect(root.querySelectorAll(".cell.open").length).toBeGreaterThan(0);
  });

  it("揭开全部非雷格触发通关回调", () => {
    const results: { won: boolean }[] = [];
    const cells = start((r) => results.push(r as { won: boolean }));
    for (let i = 7; i < 64; i++) mouse(cells[i]!, "pointerdown");
    vi.advanceTimersByTime(1000);
    expect(results).toEqual([{ won: true, timeSec: 0 }]);
  });

  it("右键插旗、更新剩余雷数，踩雷判负", () => {
    const results: { won: boolean; reason?: string }[] = [];
    const cells = start((r) => results.push(r as never));
    mouse(cells[63]!, "pointerdown"); // 开局（洪泛后仅 7 号格与雷未开）
    mouse(cells[7]!, "pointerdown", 2); // 右键插旗
    expect(cells[7]!.textContent).toBe("🚩");
    expect(root.querySelector(".game-stats")!.textContent).toContain("6");
    mouse(cells[0]!, "pointerdown"); // 踩雷
    vi.advanceTimersByTime(1000);
    expect(results[0]).toMatchObject({ won: false, reason: "mine" });
  });

  it("倒计时归零判负（超时）", () => {
    const results: { reason?: string }[] = [];
    const cells = start((r) => results.push(r as never));
    mouse(cells[63]!, "pointerdown");
    vi.advanceTimersByTime(level.timeLimitSec * 1000 + 2000);
    expect(results[0]).toMatchObject({ won: false, reason: "time" });
  });
});

describe("结算弹窗", () => {
  it("通关显示用时/新纪录/下一关，点击后关闭并回调", () => {
    let next = 0;
    showResult({
      won: true,
      timeSec: 83,
      newBest: true,
      persisted: true,
      hasNext: true,
      onNext: () => next++,
      onRetry: () => {},
      onMenu: () => {},
    });
    const overlay = document.querySelector(".overlay")!;
    expect(overlay.textContent).toContain("通关");
    expect(overlay.textContent).toContain("1:23");
    expect(overlay.textContent).toContain("新纪录");
    const nextBtn = [...overlay.querySelectorAll("button")].find((b) => b.textContent === "下一关")!;
    nextBtn.click();
    expect(next).toBe(1);
    expect(document.querySelector(".overlay")).toBeNull();
  });

  it("失败显示原因与重试", () => {
    showResult({
      won: false,
      reason: "time",
      timeSec: 100,
      newBest: false,
      persisted: true,
      hasNext: false,
      onNext: () => {},
      onRetry: () => {},
      onMenu: () => {},
    });
    const overlay = document.querySelector(".overlay")!;
    expect(overlay.textContent).toContain("时间到");
    expect(overlay.textContent).toContain("重试");
    expect(overlay.textContent).not.toContain("下一关");
  });
});

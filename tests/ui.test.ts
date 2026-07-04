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

/** 模拟一次完整点按/拖动：down →(可选 move)→ up。jsdom 无 PointerEvent，用 MouseEvent 冒充 */
function press(el: Element, opts: { button?: number; dx?: number; dy?: number; touch?: boolean } = {}): void {
  const { button = 0, dx = 0, dy = 0, touch = false } = opts;
  const fire = (type: string, x: number, y: number): void => {
    const e = new MouseEvent(type, { bubbles: true, button, clientX: x, clientY: y });
    Object.defineProperty(e, "pointerType", { value: touch ? "touch" : "mouse" });
    el.dispatchEvent(e);
  };
  fire("pointerdown", 100, 100);
  if (dx !== 0 || dy !== 0) fire("pointermove", 100 + dx, 100 + dy);
  fire("pointerup", 100 + dx, 100 + dy);
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
  it("渲染 20 个藤蔓节点，仅第 1 关可玩，其余锁定", () => {
    showMenu(root, { storage: createStorage(memBackend()), onPlay: () => {} });
    const nodes = root.querySelectorAll<HTMLButtonElement>(".vine-node");
    expect(nodes).toHaveLength(20);
    expect(nodes[0]!.disabled).toBe(false);
    expect(nodes[0]!.classList.contains("current")).toBe(true);
    for (let i = 1; i < 20; i++) {
      expect(nodes[i]!.disabled).toBe(true);
      expect(nodes[i]!.classList.contains("locked")).toBe(true);
    }
    expect(root.querySelector(".menu-sub")!.textContent).toContain("二十关");
    expect(root.querySelectorAll(".vine-svg polyline").length).toBeGreaterThanOrEqual(6); // 底线+5 档色带
  });

  it("显示最好成绩、当前关高亮并自动滚动定位、可进入已解锁关", () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const storage = createStorage(memBackend());
    storage.recordWin(1, 83);
    const played: number[] = [];
    showMenu(root, { storage, onPlay: (l) => played.push(l.id) });
    const nodes = root.querySelectorAll<HTMLButtonElement>(".vine-node");
    expect(nodes[0]!.classList.contains("done")).toBe(true);
    expect(nodes[0]!.textContent).toContain("1:23");
    expect(nodes[1]!.disabled).toBe(false);
    expect(nodes[1]!.classList.contains("current")).toBe(true);
    expect(scrolled).toHaveBeenCalled();
    nodes[1]!.click();
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
    press(cells[63]!); // 右下角远离雷区
    expect(root.querySelectorAll(".cell.open").length).toBeGreaterThan(0);
  });

  it("揭开全部非雷格触发通关回调", () => {
    const results: { won: boolean }[] = [];
    const cells = start((r) => results.push(r as { won: boolean }));
    for (let i = 7; i < 64; i++) press(cells[i]!);
    vi.advanceTimersByTime(1000);
    expect(results).toEqual([{ won: true, timeSec: 0 }]);
  });

  it("右键插旗、更新剩余雷数，踩雷判负", () => {
    const results: { won: boolean; reason?: string }[] = [];
    const cells = start((r) => results.push(r as never));
    press(cells[63]!); // 开局（洪泛后仅 7 号格与雷未开）
    press(cells[7]!, { button: 2 }); // 右键插旗
    expect(cells[7]!.textContent).toBe("🚩");
    expect(root.querySelector(".game-stats")!.textContent).toContain("6");
    press(cells[0]!); // 踩雷
    vi.advanceTimersByTime(1000);
    expect(results[0]).toMatchObject({ won: false, reason: "mine" });
  });

  it("倒计时归零判负（超时）", () => {
    const results: { reason?: string }[] = [];
    const cells = start((r) => results.push(r as never));
    press(cells[63]!);
    vi.advanceTimersByTime(level.timeLimitSec * 1000 + 2000);
    expect(results[0]).toMatchObject({ won: false, reason: "time" });
  });

  it("拖动超过阈值：平移雷区且不挖格", () => {
    const cells = start();
    press(cells[63]!, { dx: -30 });
    expect(root.querySelectorAll(".cell.open")).toHaveLength(0); // 未误触
    const board = root.querySelector<HTMLElement>(".board")!;
    expect(board.style.transform).toBe("translate(-30px, 0px) scale(1)");
  });

  it("滚轮缩放：以指针为中心改变 scale", () => {
    start();
    const vp = root.querySelector<HTMLElement>(".board-viewport")!;
    vp.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
    const board = root.querySelector<HTMLElement>(".board")!;
    expect(board.style.transform).toContain("scale(1.15");
  });

  it("触摸长按 = 反模式（挖开模式下长按插旗）", () => {
    const cells = start();
    press(cells[63]!, { touch: true }); // 触摸点按开局
    const down = new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 100 });
    Object.defineProperty(down, "pointerType", { value: "touch" });
    cells[7]!.dispatchEvent(down);
    vi.advanceTimersByTime(400); // 越过 LONG_PRESS_MS=350
    const up = new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 100, clientY: 100 });
    Object.defineProperty(up, "pointerType", { value: "touch" });
    cells[7]!.dispatchEvent(up);
    expect(cells[7]!.textContent).toBe("🚩");
  });

  it("开局前可插旗：计数联动、首挖后旗保留", () => {
    const cells = start();
    press(cells[7]!, { button: 2 }); // 盘面未生成时右键
    expect(cells[7]!.textContent).toBe("🚩");
    expect(root.querySelector(".game-stats")!.textContent).toContain("6"); // 7 - 1
    press(cells[7]!, { button: 2 }); // 再点取消
    expect(cells[7]!.textContent).toBe("");
    press(cells[7]!, { button: 2 }); // 重新插上
    press(cells[63]!); // 首挖生成盘面
    expect(cells[7]!.textContent).toBe("🚩"); // 旗保留
    expect(root.querySelector(".game-stats")!.textContent).toContain("6");
  });

  it("开局前预旗格上左键挖无操作（不生成盘面）", () => {
    const cells = start();
    press(cells[5]!, { button: 2 });
    press(cells[5]!); // 对着旗挖
    expect(root.querySelectorAll(".cell.open")).toHaveLength(0);
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

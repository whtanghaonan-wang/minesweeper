/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoard } from "../src/core/board";
import { LEVELS } from "../src/core/levels";
import { showGame } from "../src/ui/game";

vi.mock("../src/core/generator", () => ({
  generate: (level: { width: number; height: number }) =>
    createBoard(level.width, level.height, [0, 1, 2, 3, 4, 5, 6]),
}));
vi.mock("../src/ui/audio", () => ({
  unlock: vi.fn(), setMuted: vi.fn(), isMuted: vi.fn(() => false),
  playBlank: vi.fn(), playNumber: vi.fn(), playBoom: vi.fn(), playWin: vi.fn(),
  playLose: vi.fn(), playFlag: vi.fn(), playUnflag: vi.fn(),
}));

let root: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("div");
  document.body.appendChild(root);
  Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});
afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); });

function start() {
  showGame(root, { level: LEVELS[0]!, onExit: () => {}, onFinish: () => {},
    onToggleSound: () => {} });
  return root.querySelector<HTMLElement>("[role=grid]")!;
}

describe("游戏棋盘无障碍", () => {
  it("DOM 严格为 grid > row > gridcell，且只有一个 Tab 停点", () => {
    const grid = start();
    expect(grid.getAttribute("aria-rowcount")).toBe("8");
    expect(grid.getAttribute("aria-colcount")).toBe("8");
    expect(grid.querySelectorAll(":scope > [role=row]")).toHaveLength(8);
    expect(grid.querySelectorAll("[role=row] > [role=gridcell]")).toHaveLength(64);
    expect(grid.querySelectorAll('[role=gridcell][tabindex="0"]')).toHaveLength(1);
    expect(grid.querySelectorAll('[role=gridcell][tabindex="-1"]')).toHaveLength(63);
    expect(grid.querySelector('[role=gridcell]')!.getAttribute("aria-label"))
      .toBe("第 1 行，第 1 列，未揭开");
  });

  it("方向键只移动焦点；Space 只挖一次；F 只切旗一次", () => {
    const grid = start();
    const first = grid.querySelector<HTMLButtonElement>('[role=gridcell][tabindex="0"]')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const second = grid.querySelector<HTMLButtonElement>('[role=gridcell][tabindex="0"]')!;
    expect(second.dataset["logicalIndex"]).toBe("1");
    expect(grid.querySelectorAll(".cell.open")).toHaveLength(0);

    second.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const safe = grid.querySelector<HTMLButtonElement>('[role=gridcell][tabindex="0"]')!;
    expect(safe.dataset["logicalIndex"]).toBe("9");
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    safe.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    const openAfterKey = grid.querySelectorAll(".cell.open").length;
    safe.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(grid.querySelectorAll(".cell.open")).toHaveLength(openAfterKey);

    const target = grid.querySelector<HTMLButtonElement>('[data-logical-index="0"]')!;
    target.focus();
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
    expect(target.textContent).toBe("🚩");
  });

  it("模式按钮暴露 aria-pressed；计时不进入 live region", () => {
    start();
    const dig = root.querySelector<HTMLButtonElement>(".mode-btn:first-child")!;
    const flag = root.querySelector<HTMLButtonElement>(".mode-btn:last-child")!;
    expect(dig.getAttribute("aria-pressed")).toBe("true");
    flag.click();
    expect(dig.getAttribute("aria-pressed")).toBe("false");
    expect(flag.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector(".stat.num")!.getAttribute("aria-live")).toBe("polite");
    expect(root.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it("终局 DOM 标签区分触发雷、普通雷、错误旗和未揭开安全格", () => {
    const grid = start();
    const safe = grid.querySelector<HTMLButtonElement>('[data-logical-index="9"]')!;
    safe.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const wrong = grid.querySelector<HTMLButtonElement>('[data-logical-index="7"]')!;
    wrong.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
    const boom = grid.querySelector<HTMLButtonElement>('[data-logical-index="0"]')!;
    boom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(grid.querySelectorAll(".cell.boom")).toHaveLength(1);
    expect(boom.getAttribute("aria-label")).toContain("已触发的雷");
    expect(grid.querySelector('[data-logical-index="1"]')!.getAttribute("aria-label"))
      .toContain("雷");
    expect(wrong.getAttribute("aria-label")).toContain("错误旗帜");
    expect(grid.querySelector('[data-logical-index="8"]')!.getAttribute("aria-label"))
      .toContain("未揭开的安全格");
  });

  it("数字格 chord 踩雷时把真实雷标为触发雷，不误标动作数字格", () => {
    const grid = start();
    grid.querySelector<HTMLButtonElement>('[data-logical-index="63"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const wrong = grid.querySelector<HTMLButtonElement>('[data-logical-index="7"]')!;
    wrong.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
    const number = grid.querySelector<HTMLButtonElement>('[data-logical-index="15"]')!;
    expect(number.classList.contains("open")).toBe(true);

    number.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(grid.querySelector('[data-logical-index="6"]')!.getAttribute("aria-label"))
      .toContain("已触发的雷");
    expect(number.getAttribute("aria-label")).not.toContain("已触发的雷");
    expect(number.classList.contains("boom")).toBe(false);
    expect(wrong.getAttribute("aria-label")).toContain("错误旗帜");
  });

  it("数字格 chord 同时触发多颗雷时只标一颗触发雷，其余雷仍可被读屏识别", () => {
    const grid = start();
    const number = grid.querySelector<HTMLButtonElement>('[data-logical-index="9"]')!;
    number.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    for (const logical of [8, 16, 17]) {
      grid.querySelector<HTMLButtonElement>(`[data-logical-index="${logical}"]`)!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
    }
    const correctFlag = grid.querySelector<HTMLButtonElement>('[data-logical-index="3"]')!;
    correctFlag.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));

    number.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    const booms = grid.querySelectorAll<HTMLButtonElement>(".cell.boom");
    expect(booms).toHaveLength(1);
    expect(booms[0]!.dataset["logicalIndex"]).toBe("0");
    expect(booms[0]!.getAttribute("aria-label")).toContain("已触发的雷");
    for (const logical of [1, 2]) {
      const mine = grid.querySelector<HTMLButtonElement>(`[data-logical-index="${logical}"]`)!;
      expect(mine.classList.contains("mine-shown")).toBe(true);
      expect(mine.getAttribute("aria-label")).toContain("雷");
      expect(mine.getAttribute("aria-label")).not.toContain("空白");
    }
    for (const logical of [8, 16, 17]) {
      expect(grid.querySelector(`[data-logical-index="${logical}"]`)!.getAttribute("aria-label"))
        .toContain("错误旗帜");
    }
    expect(correctFlag.classList.contains("flagged")).toBe(true);
    expect(correctFlag.classList.contains("mine-shown")).toBe(false);
    expect(correctFlag.getAttribute("aria-label")).toContain("已插旗");
  });

  it("大盘同方向缩小时仍把当前 roving 格完整留在操作净空区", () => {
    showGame(root, {
      level: LEVELS[20]!,
      onExit: () => {}, onFinish: () => {}, onToggleSound: () => {},
    });
    const viewport = root.querySelector<HTMLElement>(".board-viewport")!;
    const top = root.querySelector<HTMLElement>(".game-top")!;
    const bottom = root.querySelector<HTMLElement>(".game-bottom")!;
    Object.defineProperties(viewport, {
      clientWidth: { value: 800, configurable: true },
      clientHeight: { value: 1200, configurable: true },
    });
    Object.defineProperty(top, "offsetHeight", { value: 60, configurable: true });
    Object.defineProperty(bottom, "offsetHeight", { value: 80, configurable: true });
    root.querySelector<HTMLButtonElement>(".view-mode-btn:last-child")!.click();

    const jump = root.querySelector<HTMLButtonElement>('[data-logical-index="500"]')!;
    jump.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    Object.defineProperties(viewport, {
      clientWidth: { value: 320, configurable: true },
      clientHeight: { value: 500, configurable: true },
    });
    window.dispatchEvent(new Event("resize"));

    const active = root.querySelector<HTMLButtonElement>('[role=gridcell][tabindex="0"]')!;
    const visual = Number(active.dataset["i"]);
    const transform = root.querySelector<HTMLElement>(".board")!.style.transform;
    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(transform)!;
    const tx = Number(match[1]);
    const ty = Number(match[2]);
    const scale = Number(match[3]);
    const left = tx + (10 + (visual % 21) * 43) * scale;
    const topY = ty + (10 + Math.floor(visual / 21) * 43) * scale;
    expect(left).toBeGreaterThanOrEqual(4);
    expect(left + 40 * scale).toBeLessThanOrEqual(316);
    expect(topY).toBeGreaterThanOrEqual(64);
    expect(topY + 40 * scale).toBeLessThanOrEqual(416);
  });
});

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

vi.mock("../src/ui/audio", () => ({
  unlock: vi.fn(),
  setMuted: vi.fn(),
  isMuted: vi.fn(() => false),
  playBlank: vi.fn(),
  playNumber: vi.fn(),
  playBoom: vi.fn(),
  playWin: vi.fn(),
  playLose: vi.fn(),
  playFlag: vi.fn(),
  playUnflag: vi.fn(),
}));
import * as audio from "../src/ui/audio";

function memBackend() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

/** 模拟一次完整点按/拖动：down →(可选 move)→ up。jsdom 无 PointerEvent，用 MouseEvent 冒充。
 *  v2.1 起命中按坐标几何计算，坐标从 data-i 反推（8×8 竖屏，内边距10 栅距43 格心+20） */
const GRID_W = 8;
function cellPoint(el: Element): { x: number; y: number } {
  const i = Number((el as HTMLElement).dataset["i"]);
  return { x: 10 + (i % GRID_W) * 43 + 20, y: 10 + Math.floor(i / GRID_W) * 43 + 20 };
}
function press(
  el: Element,
  opts: { button?: number; dx?: number; dy?: number; touch?: boolean } = {},
): void {
  const { button = 0, dx = 0, dy = 0, touch = false } = opts;
  const p = cellPoint(el);
  const fire = (type: string, x: number, y: number): void => {
    const e = new MouseEvent(type, { bubbles: true, button, clientX: x, clientY: y });
    Object.defineProperty(e, "pointerType", { value: touch ? "touch" : "mouse" });
    el.dispatchEvent(e);
  };
  fire("pointerdown", p.x, p.y);
  if (dx !== 0 || dy !== 0) fire("pointermove", p.x + dx, p.y + dy);
  fire("pointerup", p.x + dx, p.y + dy);
}

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("div");
  document.body.appendChild(root);
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("选关页", () => {
  it("菜单返回按钮是独立光学表面", () => {
    showMenu(root, {
      storage: createStorage(memBackend()), onPlay: () => {}, onBack: () => {},
    });
    const back = root.querySelector(".menu-back")!;
    expect(back.hasAttribute("data-liquid-glass")).toBe(true);
    expect(back.hasAttribute("data-jelly")).toBe(true);
  });

  it("菜单 roving 聚焦当前关，方向/Home/End 跳过锁定节点", () => {
    const storage = createStorage(memBackend());
    storage.recordWin(1, 10);
    storage.recordWin(2, 20);
    showMenu(root, { storage, onPlay: () => {}, onBack: () => {} });
    const nodes = [...root.querySelectorAll<HTMLButtonElement>(".vine-node:not(:disabled)")];
    const navigate = (
      from: HTMLButtonElement,
      key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End",
      expected: HTMLButtonElement,
    ): void => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      from.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(nodes.filter((node) => node.tabIndex === 0)).toEqual([expected]);
      expect(document.activeElement).toBe(expected);
    };

    expect(nodes).toHaveLength(3);
    expect(nodes.filter((node) => node.tabIndex === 0)).toHaveLength(1);
    expect(document.activeElement).toBe(nodes[2]);

    navigate(nodes[2]!, "ArrowLeft", nodes[1]!);
    navigate(nodes[1]!, "ArrowUp", nodes[0]!);
    navigate(nodes[0]!, "ArrowUp", nodes[0]!);
    navigate(nodes[0]!, "ArrowLeft", nodes[0]!);
    navigate(nodes[0]!, "ArrowRight", nodes[1]!);
    navigate(nodes[1]!, "ArrowDown", nodes[2]!);
    navigate(nodes[2]!, "ArrowDown", nodes[2]!);
    navigate(nodes[2]!, "ArrowRight", nodes[2]!);
    navigate(nodes[2]!, "Home", nodes[0]!);
    navigate(nodes[0]!, "End", nodes[2]!);
  });

  it("50 关全通时默认聚焦 L50", () => {
    const storage = createStorage(memBackend());
    for (const level of LEVELS) storage.recordWin(level.id, 1);
    showMenu(root, { storage, onPlay: () => {}, onBack: () => {} });
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toContain("第 50 关");
  });

  it("渲染 50 个藤蔓节点，仅第 1 关可玩，其余锁定", () => {
    showMenu(root, { storage: createStorage(memBackend()), onPlay: () => {}, onBack: () => {} });
    const nodes = root.querySelectorAll<HTMLButtonElement>(".vine-node");
    expect(nodes).toHaveLength(50);
    expect(nodes[0]!.disabled).toBe(false);
    expect(nodes[0]!.classList.contains("current")).toBe(true);
    for (let i = 1; i < 50; i++) {
      expect(nodes[i]!.disabled).toBe(true);
      expect(nodes[i]!.classList.contains("locked")).toBe(true);
    }
    expect(root.querySelector(".menu-sub")!.textContent).toContain("五十关");
    expect(root.querySelectorAll(".vine-svg polyline").length).toBeGreaterThanOrEqual(11); // 底线+10 档色带
  });

  it("显示最好成绩、当前关高亮并自动滚动定位、可进入已解锁关", () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const storage = createStorage(memBackend());
    storage.recordWin(1, 83);
    const played: number[] = [];
    showMenu(root, { storage, onPlay: (l) => played.push(l.id), onBack: () => {} });
    const nodes = root.querySelectorAll<HTMLButtonElement>(".vine-node");
    expect(nodes[0]!.classList.contains("done")).toBe(true);
    expect(nodes[0]!.textContent).toContain("1:23");
    expect(nodes[1]!.disabled).toBe(false);
    expect(nodes[1]!.classList.contains("current")).toBe(true);
    expect(scrolled).toHaveBeenCalled();
    nodes[1]!.click();
    expect(played).toEqual([2]);
  });

  it("0 秒成绩重载后在节点文字和 aria-label 中都显示 0:00", () => {
    const backend = memBackend();
    createStorage(backend).recordWin(1, 0);
    showMenu(root, {
      storage: createStorage(backend),
      onPlay: () => {},
      onBack: () => {},
    });
    const first = root.querySelector<HTMLButtonElement>(".vine-node")!;
    expect(first.querySelector(".vn-best")!.textContent).toBe("0:00");
    expect(first.getAttribute("aria-label")).toContain("0:00");
  });

  it("返回钮回首页回调", () => {
    let back = 0;
    showMenu(root, {
      storage: createStorage(memBackend()),
      onPlay: () => {},
      onBack: () => back++,
    });
    const btn = root.querySelector<HTMLButtonElement>(".menu-back")!;
    expect(btn.getAttribute("aria-label")).toBe("返回首页");
    btn.click();
    expect(back).toBe(1);
  });

  it("已通关但无成绩(v1 迁移)显示 — 而非 未通关", () => {
    const backend = memBackend();
    backend.setItem(
      "minesweeper-save-v1",
      '{"version":2,"unlockedLevel":3,"bestTimes":{}}',
    );
    showMenu(root, { storage: createStorage(backend), onPlay: () => {}, onBack: () => {} });
    const nodes = root.querySelectorAll<HTMLButtonElement>(".vine-node");
    expect(nodes[0]!.classList.contains("done")).toBe(true);
    expect(nodes[0]!.querySelector(".vn-best")!.textContent).toBe("—");
    expect(nodes[1]!.querySelector(".vn-best")!.textContent).toBe("—");
    expect(nodes[2]!.querySelector(".vn-best")!.textContent).toBe("未通关"); // current 关仍显示未通关
  });
});

describe("游戏页", () => {
  const level = LEVELS[0]!; // 8x8, 7 雷（mock 后雷在 0..6）

  function start(onFinish: (r: unknown) => void = () => {}) {
    vi.useFakeTimers();
    // 竖屏窗口，避免触发宽屏行列转置，保证视觉索引 == 逻辑索引
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    showGame(root, {
      level,
      onExit: () => {},
      onFinish: onFinish as never,
      onToggleSound: () => {},
    });
    return root.querySelectorAll<HTMLButtonElement>(".cell");
  }

  it("游戏只有 top/bottom 两层 surface，内部按钮只 jelly，棋盘不玻璃化", () => {
    start();
    const surfaces = root.querySelectorAll(".game-top[data-liquid-glass], " +
      ".bottom-actions[data-liquid-glass]");
    expect(surfaces).toHaveLength(2);
    expect([...surfaces].every((surface) => surface.classList.contains("glass-compact")))
      .toBe(true);
    for (const button of root.querySelectorAll(".game-top button, .bottom-actions button")) {
      expect(button.hasAttribute("data-jelly")).toBe(true);
      expect(button.hasAttribute("data-liquid-glass")).toBe(false);
    }
    expect(root.querySelector(".board [data-liquid-glass], .board[data-liquid-glass], " +
      ".cell[data-jelly]")).toBeNull();
  });

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
    const down = new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 331, clientY: 30 });
    Object.defineProperty(down, "pointerType", { value: "touch" });
    cells[7]!.dispatchEvent(down);
    vi.advanceTimersByTime(400); // 越过 LONG_PRESS_MS=350
    const up = new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 331, clientY: 30 });
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

  it("点在格间缝隙:吸附最近格照常挖开(死区清零)", () => {
    start();
    const vp = root.querySelector<HTMLElement>(".board-viewport")!;
    // (51.5, 331):x 在 0/1 列缝隙上,y 在第 7 行格心 → 应吸附挖开 56 号格
    const fire = (type: string, x: number, y: number): void => {
      const e = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
      Object.defineProperty(e, "pointerType", { value: "mouse" });
      vp.dispatchEvent(e);
    };
    fire("pointerdown", 51.5, 331);
    fire("pointerup", 51.5, 331);
    expect(root.querySelectorAll(".cell.open").length).toBeGreaterThan(0);
  });

  it("鼠标 7px 抖动仍算点击(阈值 8px)", () => {
    const cells = start();
    press(cells[63]!, { dx: 7 });
    expect(root.querySelectorAll(".cell.open").length).toBeGreaterThan(0);
  });

  it("鼠标移动 8px 转平移,不挖格", () => {
    const cells = start();
    press(cells[63]!, { dx: -8 });
    expect(root.querySelectorAll(".cell.open")).toHaveLength(0);
    expect(root.querySelector<HTMLElement>(".board")!.style.transform).toBe(
      "translate(-8px, 0px) scale(1)",
    );
  });

  it("音效触发:空白挖/数字挖/通关", () => {
    const cells = start();
    press(cells[63]!); // 洪泛(挖开格邻雷 0)
    expect(vi.mocked(audio.playBlank)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audio.playNumber)).not.toHaveBeenCalled();
    press(cells[7]!); // 邻雷 1 的数字格,同时完成全盘 → 通关
    expect(vi.mocked(audio.playNumber)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audio.playWin)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audio.unlock)).toHaveBeenCalled(); // 每次按下先解锁
  });

  it("踩雷:爆炸音即刻,失败音在结算暂停后", () => {
    const cells = start();
    press(cells[63]!);
    press(cells[0]!); // 雷
    expect(vi.mocked(audio.playBoom)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audio.playLose)).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(vi.mocked(audio.playLose)).toHaveBeenCalledTimes(1);
  });

  it("超时:无爆炸音,仅失败音", () => {
    const cells = start();
    press(cells[63]!);
    vi.advanceTimersByTime(level.timeLimitSec * 1000 + 2000);
    expect(vi.mocked(audio.playBoom)).not.toHaveBeenCalled();
    expect(vi.mocked(audio.playLose)).toHaveBeenCalledTimes(1);
  });

  it("插旗与预旗不出声", () => {
    const cells = start();
    press(cells[7]!, { button: 2 }); // 预旗
    press(cells[63]!); // 开局
    press(cells[8]!, { button: 2 }); // 已开局插旗(8 号已开?否——8 号是数字格已被洪泛开,换未开格)
    expect(vi.mocked(audio.playNumber)).not.toHaveBeenCalled();
    expect(vi.mocked(audio.playBoom)).not.toHaveBeenCalled();
  });

  it("踩雷后结算暂停窗口内重开:失败音与结算回调整体丢弃", () => {
    const finishes: unknown[] = [];
    const cells = start((r) => finishes.push(r));
    press(cells[63]!);
    press(cells[0]!); // 雷
    expect(vi.mocked(audio.playBoom)).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLButtonElement>(".restart")!.click();
    vi.advanceTimersByTime(700);
    expect(vi.mocked(audio.playLose)).not.toHaveBeenCalled();
    expect(finishes).toEqual([]);
  });

  it("通关后结算暂停窗口内退出:结算立即冲刷,成绩不丢", () => {
    const finishes: Array<{ won: boolean }> = [];
    const cells = start((r) => finishes.push(r as { won: boolean }));
    press(cells[63]!);
    press(cells[7]!); // 通关
    root.querySelector<HTMLButtonElement>(".back")!.click();
    expect(finishes).toHaveLength(1);
    expect(finishes[0]!.won).toBe(true);
    vi.advanceTimersByTime(700);
    expect(finishes).toHaveLength(1); // 不重复回调
  });

  it("顶栏静音钮:切换调 setMuted 并回调持久化", () => {
    const toggles: boolean[] = [];
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    showGame(root, {
      level,
      onExit: () => {},
      onFinish: () => {},
      onToggleSound: (on) => toggles.push(on),
    });
    const btn = root.querySelector<HTMLButtonElement>(".game-sound")!;
    expect(btn.textContent).toBe("🔊"); // isMuted mock 恒 false
    btn.click();
    expect(vi.mocked(audio.setMuted)).toHaveBeenCalledWith(true);
    expect(toggles).toEqual([false]);
  });

  it("悬浮布局:提示行并入底栏,操作行有包裹容器", () => {
    start();
    expect(root.querySelector(".game-bottom .pc-hint")).not.toBeNull();
    expect(root.querySelector(".game-bottom .bottom-actions .mode-toggle")).not.toBeNull();
    expect(root.querySelector(".game-bottom .bottom-actions .restart")).not.toBeNull();
    expect(root.querySelector(".game > .board-viewport")).not.toBeNull();
  });

  it("旗音:预旗/盘上右键 插响拔响,拔旗低一档走 playUnflag", () => {
    const cells = start();
    press(cells[7]!, { button: 2 }); // 预旗
    expect(vi.mocked(audio.playFlag)).toHaveBeenCalledTimes(1);
    press(cells[7]!, { button: 2 }); // 预旗取消
    expect(vi.mocked(audio.playUnflag)).toHaveBeenCalledTimes(1);
    press(cells[7]!, { button: 2 }); // 重新预旗
    press(cells[63]!); // 首挖开局(预旗落盘不再响)
    expect(vi.mocked(audio.playFlag)).toHaveBeenCalledTimes(2);
    press(cells[7]!, { button: 2 }); // 盘上拔旗
    expect(vi.mocked(audio.playUnflag)).toHaveBeenCalledTimes(2);
    press(cells[7]!, { button: 2 }); // 盘上插旗
    expect(vi.mocked(audio.playFlag)).toHaveBeenCalledTimes(3);
  });

  it("旗音:触摸长按插旗同样响 playFlag", () => {
    const cells = start();
    press(cells[63]!, { touch: true }); // 开局
    const down = new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 331, clientY: 30 });
    Object.defineProperty(down, "pointerType", { value: "touch" });
    cells[7]!.dispatchEvent(down);
    vi.advanceTimersByTime(400);
    const up = new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 331, clientY: 30 });
    Object.defineProperty(up, "pointerType", { value: "touch" });
    cells[7]!.dispatchEvent(up);
    expect(vi.mocked(audio.playFlag)).toHaveBeenCalledTimes(1);
  });

  it("按住期间滚轮缩放:抬起不挖格(v2.1 终审 Minor#3)", () => {
    const cells = start();
    const vp = root.querySelector<HTMLElement>(".board-viewport")!;
    const p = { x: 10 + 7 * 43 + 20, y: 10 + 7 * 43 + 20 }; // 63 号格心
    const fire = (type: string): void => {
      const e = new MouseEvent(type, { bubbles: true, button: 0, clientX: p.x, clientY: p.y });
      Object.defineProperty(e, "pointerType", { value: "mouse" });
      cells[63]!.dispatchEvent(e);
    };
    fire("pointerdown");
    vp.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
    fire("pointerup");
    expect(root.querySelectorAll(".cell.open")).toHaveLength(0);
  });

  it("旋转会释放全部 pointer capture，并保留当前 flag 与模式", () => {
    start();
    const viewport = root.querySelector<HTMLElement>(".board-viewport")!;
    const captured = new Set<number>();
    viewport.setPointerCapture = vi.fn((id) => { captured.add(id); });
    viewport.hasPointerCapture = vi.fn((id) => captured.has(id));
    viewport.releasePointerCapture = vi.fn((id) => { captured.delete(id); });
    root.querySelector<HTMLButtonElement>('[data-logical-index="7"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
    root.querySelector<HTMLButtonElement>(".mode-btn:last-child")!.click();
    for (const id of [11, 12]) {
      const down = new MouseEvent("pointerdown", {
        bubbles: true, clientX: 40 + id, clientY: 120, button: 0,
      });
      Object.defineProperties(down, {
        pointerId: { value: id }, pointerType: { value: "touch" },
      });
      viewport.dispatchEvent(down);
    }
    Object.defineProperty(window, "innerWidth", { value: 844, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 390, configurable: true });
    window.dispatchEvent(new Event("resize"));
    expect(captured).toEqual(new Set());
    expect(viewport.releasePointerCapture).toHaveBeenCalledWith(11);
    expect(viewport.releasePointerCapture).toHaveBeenCalledWith(12);
    expect(root.querySelector('[data-logical-index="7"]')!.textContent).toBe("🚩");
    expect(root.querySelector(".mode-btn:last-child")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("无尽模式:标题显示 ♾ 无尽与连胜徽章", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    showGame(root, {
      level,
      mode: { kind: "endless", streak: 3 },
      onExit: () => {},
      onFinish: () => {},
      onToggleSound: () => {},
    });
    const title = root.querySelector(".game-title")!;
    expect(title.textContent).toContain("无尽");
    expect(title.textContent).toContain("连胜 3");
    expect(title.querySelector(".tier-endless")).not.toBeNull();
    expect(title.textContent).not.toContain("第");
  });
});

describe("结算弹窗", () => {
  it("结果面板是唯一 surface，操作按钮只 jelly", () => {
    showResult({
      won: false, reason: "mine", timeSec: 1, newBest: false, persisted: true,
      hasNext: false, backgroundRoot: root, onNext: () => {}, onRetry: () => {},
      onMenu: () => {},
    });
    const modal = document.querySelector(".modal[data-liquid-glass]")!;
    expect(modal.classList.contains("glass-clear")).toBe(true);
    expect(modal.querySelector("[data-liquid-glass]")).toBeNull();
    for (const button of modal.querySelectorAll("button")) {
      expect(button.hasAttribute("data-jelly")).toBe(true);
      expect(button.hasAttribute("data-liquid-glass")).toBe(false);
    }
  });

  it("通关显示用时/新纪录/下一关，点击后关闭并回调", () => {
    let next = 0;
    showResult({
      won: true,
      timeSec: 83,
      newBest: true,
      persisted: true,
      hasNext: true,
      backgroundRoot: root,
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
      backgroundRoot: root,
      onNext: () => {},
      onRetry: () => {},
      onMenu: () => {},
    });
    const overlay = document.querySelector(".overlay")!;
    expect(overlay.textContent).toContain("时间到");
    expect(overlay.textContent).toContain("重试");
    expect(overlay.textContent).not.toContain("下一关");
  });

  it("失败局保存失败时显示统一的自动重试提示", () => {
    showResult({
      won: false,
      reason: "mine",
      timeSec: 12,
      newBest: false,
      persisted: false,
      hasNext: false,
      backgroundRoot: root,
      onNext: () => {},
      onRetry: () => {},
      onMenu: () => {},
    });

    expect(document.querySelector(".save-warn")!.textContent).toBe(
      "进度暂未保存，将自动重试",
    );
  });

  it("无尽·胜:连胜标题、下一盘、最长连胜新纪录徽章、回首页", () => {
    let next = 0;
    let menu = 0;
    showResult({
      won: true, timeSec: 100, newBest: true, persisted: true, hasNext: true,
      backgroundRoot: root,
      endless: { streak: 7 },
      onNext: () => next++, onRetry: () => {}, onMenu: () => menu++,
    });
    const overlay = document.querySelector(".overlay")!;
    expect(overlay.textContent).toContain("连胜 7");
    expect(overlay.textContent).toContain("最长连胜");
    const buttons = [...overlay.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toContain("下一盘");
    expect(buttons).toContain("回首页");
    expect(buttons).not.toContain("下一关");
    [...overlay.querySelectorAll("button")].find((b) => b.textContent === "下一盘")!.click();
    expect(next).toBe(1);
  });

  it("无尽·负:连胜止于 N、再来一盘", () => {
    showResult({
      won: false, reason: "mine", timeSec: 50, newBest: false, persisted: true, hasNext: false,
      backgroundRoot: root,
      endless: { streak: 4 },
      onNext: () => {}, onRetry: () => {}, onMenu: () => {},
    });
    const overlay = document.querySelector(".overlay")!;
    expect(overlay.textContent).toContain("连胜止于 4");
    const buttons = [...overlay.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toContain("再来一盘");
    expect(buttons).toContain("回首页");
  });
});

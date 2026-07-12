/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEVELS, type LevelSpec } from "../src/core/levels";
import { createStorage } from "../src/core/storage";
import { showHome } from "../src/ui/home";
import { setMuted } from "../src/ui/audio";
import { createUiPrefs } from "../src/ui/ui-prefs";

vi.mock("../src/ui/audio", () => ({ setMuted: vi.fn() }));

function memBackend() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("div");
  document.body.appendChild(root);
});
afterEach(() => {
  document.body.innerHTML = "";
  delete document.documentElement.dataset["reducedTransparency"];
  vi.clearAllMocks();
});

function show(storage = createStorage(memBackend()), over: Partial<Parameters<typeof showHome>[1]> = {}) {
  const played: LevelSpec[] = [];
  let selected = 0;
  let endless = 0;
  showHome(root, {
    storage,
    uiPrefs: createUiPrefs(memBackend()),
    version: "9.9.9-test",
    onContinue: (l) => played.push(l),
    onSelect: () => selected++,
    onEndless: () => endless++,
    ...over,
  });
  return { played, get selected() { return selected; }, get endless() { return endless; }, storage };
}

describe("首页", () => {
  it("首页触控条按统计/主操作/次操作/工具分组且版本号在玻璃外", () => {
    show();
    const panel = root.querySelector<HTMLElement>(".home-panel")!;
    expect(Array.from(panel.children, (child) => child.classList[0])).toEqual([
      "home-stats",
      "home-bar",
      "home-play",
      "home-secondary-actions",
      "home-tools",
    ]);

    const secondaryActions = panel.querySelector<HTMLElement>(":scope > .home-secondary-actions")!;
    const tools = panel.querySelector<HTMLElement>(":scope > .home-tools")!;
    const buttonKinds = (container: HTMLElement): string[] =>
      Array.from(container.children, (child) =>
        `${child.tagName.toLowerCase()}.${child.classList[0]}`,
      );
    expect(buttonKinds(secondaryActions)).toEqual([
      "button.home-select",
      "button.home-endless",
    ]);
    expect(buttonKinds(tools)).toEqual([
      "button.sound-btn",
      "button.transparency-btn",
    ]);

    for (const [selector, parent] of [
      [".home-select", secondaryActions],
      [".home-endless", secondaryActions],
      [".sound-btn", tools],
      [".transparency-btn", tools],
    ] as const) {
      expect(panel.querySelectorAll(selector), selector).toHaveLength(1);
      expect(panel.querySelector(selector)?.parentElement, selector).toBe(parent);
      expect(panel.querySelector(`:scope > ${selector}`), selector).toBeNull();
    }
    expect(secondaryActions.querySelector(".sound-btn, .transparency-btn")).toBeNull();
    expect(tools.querySelector(".home-select, .home-endless")).toBeNull();
    expect(panel.querySelector(".home-ver")).toBeNull();
    expect(root.querySelector(".home > .home-ver")?.textContent).toBe("v9.9.9-test");
  });

  it("首页底部面板是唯一玻璃面,内部按钮只 jelly 不嵌套光学表面", () => {
    show();
    const panel = root.querySelector<HTMLElement>(".home-panel")!;
    expect(panel.hasAttribute("data-liquid-glass")).toBe(true);
    expect(panel.classList.contains("glass-clear")).toBe(true);
    expect(root.querySelectorAll("[data-liquid-glass]")).toHaveLength(1);
    for (const selector of [".home-play", ".home-select", ".home-endless",
      ".sound-btn", ".transparency-btn"]) {
      const button = root.querySelector<HTMLButtonElement>(selector)!;
      expect(button.hasAttribute("data-liquid-glass"), selector).toBe(false);
      expect(button.hasAttribute("data-jelly"), selector).toBe(true);
      expect(panel.contains(button), selector).toBe(true);
    }
  });

  it("降低透明度按钮同步 aria-pressed、DOM 与独立偏好", () => {
    const uiPrefs = createUiPrefs(memBackend());
    show(createStorage(memBackend()), { uiPrefs });
    const button = root.querySelector<HTMLButtonElement>(".transparency-btn")!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("降低透明度");
    expect(button.textContent).toBe("◫ 玻璃");

    button.click();

    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("降低透明度");
    expect(button.textContent).toBe("◼ 实色");
    expect(uiPrefs.load().reducedTransparency).toBe(true);
    expect(document.documentElement.dataset["reducedTransparency"]).toBe("true");
  });

  it("重新挂载首页时从共享 store 重新读取透明度偏好", () => {
    const uiPrefs = createUiPrefs(memBackend());
    show(createStorage(memBackend()), { uiPrefs });
    root.querySelector<HTMLButtonElement>(".transparency-btn")!.click();

    show(createStorage(memBackend()), { uiPrefs });

    expect(root.querySelector(".transparency-btn")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset["reducedTransparency"]).toBe("true");
  });

  it("首页挂载后主标题可程序聚焦", () => {
    show();
    const title = root.querySelector<HTMLHeadingElement>("h1")!;
    expect(title.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(title);
  });

  it("新档:开始游戏·第 1 关,进度 0/50,最快 —,版本号显示", () => {
    const t = show();
    expect(root.querySelector("h1")!.textContent).toBe("扫雷");
    expect(root.querySelector(".home-play")!.textContent).toContain("开始游戏 · 第 1 关");
    expect(root.querySelector(".home-stats")!.textContent).toContain("0/50");
    expect(root.querySelector(".home-stats")!.textContent).toContain("—");
    expect(root.querySelector(".home-ver")!.textContent).toBe("v9.9.9-test");
    (root.querySelector(".home-play") as HTMLButtonElement).click();
    expect(t.played.map((l) => l.id)).toEqual([1]);
  });

  it("进行中:继续·第 N 关,进度/最快取最高已通关成绩", () => {
    const storage = createStorage(memBackend());
    storage.recordWin(1, 83);
    storage.recordWin(2, 45);
    const t = show(storage);
    expect(root.querySelector(".home-play")!.textContent).toContain("继续 · 第 3 关");
    expect(root.querySelector(".home-stats")!.textContent).toContain("2/50");
    expect(root.querySelector(".home-stats")!.textContent).toContain("最近通关");
    expect(root.querySelector(".home-stats")!.textContent).toContain("0:45"); // 最高已通关=第2关
    (root.querySelector(".home-play") as HTMLButtonElement).click();
    expect(t.played.map((l) => l.id)).toEqual([3]);
    const fill = root.querySelector<HTMLElement>(".home-bar-fill")!;
    expect(fill.style.width).toBe("4%"); // 2/50
  });

  it("0 秒成绩重载后首页仍显示 0:00", () => {
    const backend = memBackend();
    createStorage(backend).recordWin(1, 0);
    show(createStorage(backend));
    expect(root.querySelector(".home-stats")!.textContent).toContain("0:00");
  });

  it("全通:再战·第 50 关", () => {
    const storage = createStorage(memBackend());
    for (const l of LEVELS) storage.recordWin(l.id, 100);
    const t = show(storage);
    expect(root.querySelector(".home-play")!.textContent).toContain("再战 · 第 50 关");
    (root.querySelector(".home-play") as HTMLButtonElement).click();
    expect(t.played.map((l) => l.id)).toEqual([50]);
  });

  it("选关按钮触发 onSelect", () => {
    const t = show();
    (root.querySelector(".home-select") as HTMLButtonElement).click();
    expect(t.selected).toBe(1);
  });

  it("音效钮:图标切换、setMuted 联动、存档持久化", () => {
    const storage = createStorage(memBackend());
    show(storage);
    const btn = root.querySelector<HTMLButtonElement>(".sound-btn")!;
    expect(btn.textContent).toBe("🔊");
    btn.click();
    expect(btn.textContent).toBe("🔇");
    expect(vi.mocked(setMuted)).toHaveBeenCalledWith(true);
    expect(storage.load().soundOn).toBe(false);
    btn.click();
    expect(btn.textContent).toBe("🔊");
    expect(vi.mocked(setMuted)).toHaveBeenLastCalledWith(false);
    expect(storage.load().soundOn).toBe(true);
  });

  it("音效写入失败时把真实持久化状态回传给应用壳", () => {
    const storage = createStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage unavailable");
      },
    });
    const onPersisted = vi.fn();
    show(storage, { onPersisted });

    root.querySelector<HTMLButtonElement>(".sound-btn")!.click();

    expect(onPersisted).toHaveBeenCalledWith(false);
  });

  it("存档静音时初始即 🔇;装饰藤蔓存在", () => {
    const storage = createStorage(memBackend());
    storage.setSoundOn(false);
    show(storage);
    expect(root.querySelector(".sound-btn")!.textContent).toBe("🔇");
    expect(root.querySelector(".home-vine path")).not.toBeNull();
  });

  it("无尽入口:未通关 50 关时灰态锁定并示明条件", () => {
    const t = show();
    const btn = root.querySelector<HTMLButtonElement>(".home-endless")!;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("无尽");
    expect(btn.textContent).toContain("通关 50 关解锁");
    btn.click();
    expect(t.endless).toBe(0);
  });

  it("无尽入口:通关 50 关后可点,触发 onEndless", () => {
    const storage = createStorage(memBackend());
    for (const l of LEVELS) storage.recordWin(l.id, 100);
    const t = show(storage);
    const btn = root.querySelector<HTMLButtonElement>(".home-endless")!;
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(t.endless).toBe(1);
  });

  it("最长连胜 >0 时统计行显示", () => {
    const storage = createStorage(memBackend());
    storage.recordEndlessWin();
    storage.recordEndlessWin();
    show(storage);
    expect(root.querySelector(".home-stats")!.textContent).toContain("最长连胜 2");
    show(createStorage(memBackend())); // 无纪录不显示
    expect(root.querySelector(".home-stats")!.textContent).not.toContain("最长连胜");
  });
});

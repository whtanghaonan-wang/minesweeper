/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEVELS, type LevelSpec } from "../src/core/levels";
import { createStorage } from "../src/core/storage";
import { showHome } from "../src/ui/home";
import { setMuted } from "../src/ui/audio";

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
  vi.clearAllMocks();
});

function show(storage = createStorage(memBackend()), over: Partial<Parameters<typeof showHome>[1]> = {}) {
  const played: LevelSpec[] = [];
  let selected = 0;
  showHome(root, {
    storage,
    version: "9.9.9-test",
    onContinue: (l) => played.push(l),
    onSelect: () => selected++,
    ...over,
  });
  return { played, get selected() { return selected; }, storage };
}

describe("首页", () => {
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

  it("存档静音时初始即 🔇;装饰藤蔓存在", () => {
    const storage = createStorage(memBackend());
    storage.setSoundOn(false);
    show(storage);
    expect(root.querySelector(".sound-btn")!.textContent).toBe("🔇");
    expect(root.querySelector(".home-vine path")).not.toBeNull();
  });
});

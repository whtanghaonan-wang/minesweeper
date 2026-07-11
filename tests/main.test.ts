/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelSpec } from "../src/core/levels";
import type {
  EndlessLossRecord,
  EndlessWinRecord,
  FlushResult,
  GameStorage,
  SaveData,
  WinRecord,
} from "../src/core/storage";
import type { GameDeps } from "../src/ui/game";
import type { HomeDeps } from "../src/ui/home";
import type { MenuDeps } from "../src/ui/menu";
import type { ResultOptions } from "../src/ui/result";

const h = vi.hoisted(() => ({
  storage: {
    load: vi.fn<() => SaveData>(),
    flushPending: vi.fn<() => FlushResult>(),
    recordWin: vi.fn<(levelId: number, timeSec: number) => WinRecord>(),
    setSoundOn: vi.fn<(on: boolean) => boolean>(),
    recordEndlessWin: vi.fn<() => EndlessWinRecord>(),
    recordEndlessLoss: vi.fn<() => EndlessLossRecord>(),
  } satisfies GameStorage,
  createStorage: vi.fn(),
  showHome: vi.fn(),
  showMenu: vi.fn(),
  showGame: vi.fn(),
  showResult: vi.fn(),
  setPersistenceWarning: vi.fn(),
  setMuted: vi.fn(),
  endlessSpec: vi.fn(),
  mulberry32: vi.fn(),
  home: undefined as HomeDeps | undefined,
  menu: undefined as MenuDeps | undefined,
  game: undefined as GameDeps | undefined,
  result: undefined as ResultOptions | undefined,
  visibilityHandler: undefined as (() => void) | undefined,
}));

vi.mock("../src/core/storage", () => ({
  createStorage: (backend: unknown) => {
    h.createStorage(backend);
    return h.storage;
  },
}));
vi.mock("../src/ui/home", () => ({
  showHome: (root: HTMLElement, deps: HomeDeps) => {
    h.home = deps;
    h.showHome(root, deps);
  },
}));
vi.mock("../src/ui/menu", () => ({
  showMenu: (root: HTMLElement, deps: MenuDeps) => {
    h.menu = deps;
    h.showMenu(root, deps);
  },
}));
vi.mock("../src/ui/game", () => ({
  showGame: (root: HTMLElement, deps: GameDeps) => {
    h.game = deps;
    h.showGame(root, deps);
  },
}));
vi.mock("../src/ui/result", () => ({
  showResult: (opts: ResultOptions) => {
    h.result = opts;
    h.showResult(opts);
  },
}));
vi.mock("../src/ui/persistence-warning", () => ({
  setPersistenceWarning: h.setPersistenceWarning,
}));
vi.mock("../src/ui/audio", () => ({ setMuted: h.setMuted }));
vi.mock("../src/core/endless", () => ({ endlessSpec: h.endlessSpec }));
vi.mock("../src/core/rng", () => ({ mulberry32: h.mulberry32 }));

const campaignLevel = {
  id: 1,
  width: 8,
  height: 8,
  mines: 7,
  timeLimitSec: 120,
  tier: "easy",
} as LevelSpec;
const endlessLevel = { ...campaignLevel, id: 999 } as LevelSpec;
const rng = (): number => 0.5;

let addEventListenerSpy: ReturnType<typeof vi.spyOn>;

async function boot(): Promise<void> {
  await import("../src/main");
}

beforeEach(() => {
  vi.resetModules();
  h.storage.load.mockReset();
  h.storage.flushPending.mockReset();
  h.storage.recordWin.mockReset();
  h.storage.setSoundOn.mockReset();
  h.storage.recordEndlessWin.mockReset();
  h.storage.recordEndlessLoss.mockReset();
  h.createStorage.mockReset();
  h.showHome.mockReset();
  h.showMenu.mockReset();
  h.showGame.mockReset();
  h.showResult.mockReset();
  h.setPersistenceWarning.mockReset();
  h.setMuted.mockReset();
  h.endlessSpec.mockReset();
  h.mulberry32.mockReset();
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  Reflect.deleteProperty(navigator, "serviceWorker");
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });

  h.home = undefined;
  h.menu = undefined;
  h.game = undefined;
  h.result = undefined;
  h.visibilityHandler = undefined;
  h.storage.load.mockReturnValue({
    version: 3,
    unlockedLevel: 1,
    bestTimes: {},
    soundOn: true,
    endless: { streak: 4, bestStreak: 4 },
  });
  h.storage.flushPending.mockReturnValue("idle");
  h.storage.setSoundOn.mockReturnValue(true);
  h.storage.recordWin.mockReturnValue({ newBest: false, unlocked: 2, persisted: true });
  h.storage.recordEndlessWin.mockReturnValue({
    streak: 5,
    bestStreak: 5,
    newBest: true,
    persisted: false,
  });
  h.storage.recordEndlessLoss.mockReturnValue({ streak: 0, bestStreak: 4, persisted: false });
  h.endlessSpec.mockReturnValue(endlessLevel);
  h.mulberry32.mockReturnValue(rng);

  const realAddEventListener = document.addEventListener.bind(document);
  addEventListenerSpy = vi.spyOn(document, "addEventListener").mockImplementation(
    ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === "visibilitychange") {
        h.visibilityHandler = () => {
          const event = new Event("visibilitychange");
          if (typeof listener === "function") listener.call(document, event);
          else listener.handleEvent(event);
        };
        return;
      }
      realAddEventListener(type, listener, options);
    }) as typeof document.addEventListener,
  );
});

afterEach(() => {
  addEventListenerSpy.mockRestore();
  document.body.innerHTML = "";
});

describe("应用壳持久化可靠性", () => {
  it("结算传入应用背景并优先保存最后操作格作为焦点", async () => {
    await boot();
    h.home!.onContinue(campaignLevel);
    const root = document.querySelector<HTMLElement>("#app")!;
    const active = document.createElement("button");
    const actionTarget = document.createElement("button");
    actionTarget.dataset["resultFocus"] = "true";
    root.append(active, actionTarget);
    active.focus();

    h.game!.onFinish({ won: true, timeSec: 9 });

    expect(h.result!.backgroundRoot).toBe(root);
    expect(h.result!.restoreFocus).toBe(actionTarget);
  });

  it("没有最后操作格时使用应用内当前焦点", async () => {
    await boot();
    h.home!.onContinue(campaignLevel);
    const root = document.querySelector<HTMLElement>("#app")!;
    const active = document.createElement("button");
    root.append(active);
    active.focus();

    h.game!.onFinish({ won: false, reason: "mine", timeSec: 5 });

    expect(h.result!.backgroundRoot).toBe(root);
    expect(h.result!.restoreFocus).toBe(active);
  });

  it("启动首页重试一次，进入选关前再重试一次", async () => {
    await boot();

    expect(h.storage.flushPending).toHaveBeenCalledTimes(1);
    h.home!.onSelect();
    expect(h.storage.flushPending).toHaveBeenCalledTimes(2);
    expect(h.showMenu).toHaveBeenCalledTimes(1);
  });

  it("无尽胜利传播失败状态和新连胜", async () => {
    await boot();
    h.home!.onEndless();
    h.game!.onFinish({ won: true, timeSec: 31 });

    expect(h.storage.recordEndlessWin).toHaveBeenCalledTimes(1);
    expect(h.result).toMatchObject({
      won: true,
      timeSec: 31,
      persisted: false,
      endless: { streak: 5 },
    });
    expect(h.setPersistenceWarning).toHaveBeenLastCalledWith(true);
  });

  it("无尽失败传播失败状态并显示失败前连胜", async () => {
    await boot();
    h.home!.onEndless();
    h.game!.onFinish({ won: false, reason: "mine", timeSec: 19 });

    expect(h.storage.recordEndlessLoss).toHaveBeenCalledTimes(1);
    expect(h.result).toMatchObject({
      won: false,
      reason: "mine",
      persisted: false,
      endless: { streak: 4 },
    });
  });

  it("普通胜利传播 recordWin 的保存失败", async () => {
    h.storage.recordWin.mockReturnValue({ newBest: true, unlocked: 2, persisted: false });
    await boot();
    h.home!.onContinue(campaignLevel);
    h.game!.onFinish({ won: true, timeSec: 42 });

    expect(h.storage.recordWin).toHaveBeenCalledWith(1, 42);
    expect(h.result).toMatchObject({ won: true, newBest: true, persisted: false });
    expect(h.setPersistenceWarning).toHaveBeenLastCalledWith(true);
  });

  it("普通失败不伪造写入，并继承已有保存警告", async () => {
    h.storage.setSoundOn.mockReturnValue(false);
    await boot();
    h.home!.onContinue(campaignLevel);
    h.game!.onToggleSound(false);
    h.game!.onFinish({ won: false, reason: "time", timeSec: 120 });

    expect(h.storage.setSoundOn).toHaveBeenCalledWith(false);
    expect(h.storage.recordWin).not.toHaveBeenCalled();
    expect(h.result).toMatchObject({ won: false, persisted: false });
  });

  it("失败重试和声音写入显示警告，后续安全点保存成功会清除", async () => {
    h.storage.flushPending.mockReturnValueOnce("failed").mockReturnValueOnce("saved");
    h.storage.setSoundOn.mockReturnValue(false);
    await boot();

    expect(h.setPersistenceWarning).toHaveBeenLastCalledWith(true);
    h.home!.onContinue(campaignLevel);
    h.game!.onToggleSound(false);
    expect(h.setPersistenceWarning).toHaveBeenLastCalledWith(true);
    h.home!.onSelect();
    expect(h.setPersistenceWarning).toHaveBeenLastCalledWith(false);
  });

  it("页面进入 hidden 时只执行一次待写重试", async () => {
    await boot();
    h.storage.flushPending.mockClear();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });

    h.visibilityHandler!();

    expect(h.storage.flushPending).toHaveBeenCalledTimes(1);
  });
});

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
import type { UiPrefsStore } from "../src/ui/ui-prefs";

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
  uiPrefs: {
    load: vi.fn(),
    setLargeBoardHintSeen: vi.fn(),
    setReducedTransparency: vi.fn(),
  } satisfies UiPrefsStore,
  createUiPrefs: vi.fn(),
  applyReducedTransparency: vi.fn(),
  cancelAllLiquidGlass: vi.fn(),
  destroyLiquidGlass: vi.fn(),
  installLiquidGlass: vi.fn(),
  pwa: { enterRoute: vi.fn() },
  mountPwaPrompt: vi.fn(),
  connectPwaRegistration: vi.fn(),
  home: undefined as HomeDeps | undefined,
  menu: undefined as MenuDeps | undefined,
  game: undefined as GameDeps | undefined,
  result: undefined as ResultOptions | undefined,
  visibilityHandler: undefined as (() => void) | undefined,
  pagehideHandler: undefined as ((event: PageTransitionEvent) => void) | undefined,
  pagehideOptions: undefined as boolean | AddEventListenerOptions | undefined,
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
vi.mock("../src/ui/ui-prefs", () => ({
  createUiPrefs: (backend: unknown) => {
    h.createUiPrefs(backend);
    return h.uiPrefs;
  },
  applyReducedTransparency: h.applyReducedTransparency,
}));
vi.mock("../src/ui/liquid-glass", () => ({
  installLiquidGlass: (root: Document) => {
    h.installLiquidGlass(root);
    return { cancelAll: h.cancelAllLiquidGlass, destroy: h.destroyLiquidGlass };
  },
}));
vi.mock("../src/ui/pwa-update", () => ({
  createPwaUpdateCoordinator: () => h.pwa,
  connectPwaRegistration: h.connectPwaRegistration,
}));
vi.mock("../src/ui/pwa-prompt", () => ({ mountPwaPrompt: h.mountPwaPrompt }));

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
let windowAddEventListenerSpy: ReturnType<typeof vi.spyOn>;

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
  h.uiPrefs.load.mockReset();
  h.uiPrefs.setLargeBoardHintSeen.mockReset();
  h.uiPrefs.setReducedTransparency.mockReset();
  h.createUiPrefs.mockReset();
  h.applyReducedTransparency.mockReset();
  h.cancelAllLiquidGlass.mockReset();
  h.destroyLiquidGlass.mockReset();
  h.installLiquidGlass.mockReset();
  h.pwa.enterRoute.mockReset();
  h.mountPwaPrompt.mockReset();
  h.connectPwaRegistration.mockReset();
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  Reflect.deleteProperty(navigator, "serviceWorker");
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });

  h.home = undefined;
  h.menu = undefined;
  h.game = undefined;
  h.result = undefined;
  h.visibilityHandler = undefined;
  h.pagehideHandler = undefined;
  h.pagehideOptions = undefined;
  h.uiPrefs.load.mockReturnValue({ largeBoardHintSeen: false, reducedTransparency: true });
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
  const realWindowAddEventListener = window.addEventListener.bind(window);
  windowAddEventListenerSpy = vi.spyOn(window, "addEventListener").mockImplementation(
    ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === "pagehide") {
        h.pagehideOptions = options;
        h.pagehideHandler = (event) => {
          if (typeof listener === "function") listener.call(window, event);
          else listener.handleEvent(event);
        };
        return;
      }
      realWindowAddEventListener(type, listener, options);
    }) as typeof window.addEventListener,
  );
});

afterEach(() => {
  addEventListenerSpy.mockRestore();
  windowAddEventListenerSpy.mockRestore();
  document.body.innerHTML = "";
});

describe("应用壳持久化可靠性", () => {
  it("启动前应用透明度偏好，玻璃控制器只初始化一次并复用于路由", async () => {
    await boot();

    expect(h.createUiPrefs).toHaveBeenCalledTimes(1);
    expect(h.applyReducedTransparency).toHaveBeenCalledWith(true);
    expect(h.applyReducedTransparency.mock.invocationCallOrder[0]).toBeLessThan(
      h.showHome.mock.invocationCallOrder[0]!,
    );
    expect(h.installLiquidGlass).toHaveBeenCalledTimes(1);
    expect(h.installLiquidGlass).toHaveBeenCalledWith(document);
    expect(h.home!.uiPrefs).toBe(h.uiPrefs);

    h.home!.onContinue(campaignLevel);
    expect(h.game!.uiPrefs).toBe(h.uiPrefs);
    h.game!.onExit();
    h.menu!.onBack();
    expect(h.installLiquidGlass).toHaveBeenCalledTimes(1);
  });

  it("进入 BFCache 时仅取消动画，恢复后普通 pagehide 仍会销毁", async () => {
    await boot();
    expect(h.pagehideHandler).toBeTypeOf("function");

    const cached = Object.assign(new Event("pagehide"), { persisted: true }) as PageTransitionEvent;
    h.pagehideHandler!(cached);

    expect(h.cancelAllLiquidGlass).toHaveBeenCalledTimes(1);
    expect(h.destroyLiquidGlass).not.toHaveBeenCalled();

    const leaving = Object.assign(new Event("pagehide"), { persisted: false }) as PageTransitionEvent;
    h.pagehideHandler!(leaving);

    expect(h.destroyLiquidGlass).toHaveBeenCalledTimes(1);
  });

  it("pagehide 监听器保持可复用而不是 once", async () => {
    await boot();

    expect(typeof h.pagehideOptions === "object" ? h.pagehideOptions.once : false).not.toBe(true);
  });

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

  it("首页/菜单/游戏/结果只向 PWA 协调器报告真实安全状态", async () => {
    await boot();
    expect(h.mountPwaPrompt).toHaveBeenCalledTimes(1);
    expect(h.pwa.enterRoute).toHaveBeenLastCalledWith("home");
    h.home!.onSelect();
    expect(h.pwa.enterRoute).toHaveBeenLastCalledWith("menu");
    h.menu!.onBack();
    expect(h.pwa.enterRoute).toHaveBeenLastCalledWith("home");
    h.home!.onEndless();
    expect(h.pwa.enterRoute).toHaveBeenLastCalledWith("game");
    h.game!.onFinish({ won: true, timeSec: 3 });
    expect(h.pwa.enterRoute).toHaveBeenLastCalledWith("result");
    h.result!.onMenu();
    expect(h.pwa.enterRoute).toHaveBeenLastCalledWith("home");
  });
});

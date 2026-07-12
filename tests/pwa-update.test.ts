import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectPwaRegistration,
  createPwaUpdateCoordinator,
} from "../src/ui/pwa-update";

afterEach(() => { vi.restoreAllMocks(); });

describe("PWA update coordinator", () => {
  it("游戏/结果中 ready 但不可见，回首页/菜单才可提示", () => {
    const coordinator = createPwaUpdateCoordinator();
    coordinator.enterRoute("game");
    coordinator.needRefresh();
    expect(coordinator.getState()).toBe("ready");
    expect(coordinator.shouldShowPrompt()).toBe(false);
    coordinator.enterRoute("result");
    expect(coordinator.shouldShowPrompt()).toBe(false);
    coordinator.enterRoute("home");
    expect(coordinator.shouldShowPrompt()).toBe(true);
  });

  it("稍后只在当前安全页隐藏，进入相同路由不解除，离开后恢复 ready", () => {
    const coordinator = createPwaUpdateCoordinator();
    coordinator.enterRoute("home");
    coordinator.needRefresh();
    coordinator.defer();
    expect(coordinator.getState()).toBe("deferred");
    expect(coordinator.shouldShowPrompt()).toBe(false);
    coordinator.enterRoute("home");
    expect(coordinator.getState()).toBe("deferred");
    coordinator.enterRoute("game");
    expect(coordinator.getState()).toBe("ready");
    coordinator.enterRoute("menu");
    expect(coordinator.shouldShowPrompt()).toBe(true);
  });

  it("重复 waiting 不覆盖 deferred 或 activating，也不重复调用 updater", async () => {
    let finishUpdate!: () => void;
    const update = vi.fn(() => new Promise<void>((resolve) => { finishUpdate = resolve; }));
    const coordinator = createPwaUpdateCoordinator();
    coordinator.enterRoute("home");
    coordinator.needRefresh();
    coordinator.defer();
    coordinator.needRefresh();
    expect(coordinator.getState()).toBe("deferred");

    coordinator.enterRoute("game");
    coordinator.enterRoute("menu");
    coordinator.setUpdater(update);
    const activation = coordinator.activate();
    coordinator.needRefresh();
    coordinator.needRefresh();
    expect(coordinator.getState()).toBe("activating");
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
    finishUpdate();
    await activation;
  });

  it("其他安全标签激活时游戏页不重载，回安全页后才由用户确认", async () => {
    const reload = vi.fn();
    const coordinator = createPwaUpdateCoordinator(reload);
    coordinator.enterRoute("game");
    coordinator.needRefresh();
    coordinator.controllerChanged();
    expect(coordinator.getState()).toBe("ready");
    expect(coordinator.getSnapshot().reloadReady).toBe(true);
    expect(coordinator.shouldShowPrompt()).toBe(false);
    expect(reload).not.toHaveBeenCalled();

    coordinator.enterRoute("menu");
    expect(coordinator.shouldShowPrompt()).toBe(true);
    await coordinator.activate();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("本标签已确认时 controlling 只重载一次；稍后仍尊重本页延后", async () => {
    const reload = vi.fn();
    const coordinator = createPwaUpdateCoordinator(reload);
    coordinator.setUpdater(vi.fn(async () => {}));
    coordinator.enterRoute("home");
    coordinator.needRefresh();
    await coordinator.activate();
    coordinator.controllerChanged();
    coordinator.controllerChanged();
    expect(reload).toHaveBeenCalledTimes(1);

    const deferred = createPwaUpdateCoordinator();
    deferred.enterRoute("menu");
    deferred.needRefresh();
    deferred.defer();
    deferred.controllerChanged();
    expect(deferred.getState()).toBe("deferred");
    expect(deferred.getSnapshot().reloadReady).toBe(true);
    deferred.enterRoute("game");
    expect(deferred.getState()).toBe("ready");
  });

  it("确认后抢先进入游戏不会被 controlling 打断，回安全页才重载", async () => {
    const reload = vi.fn();
    const coordinator = createPwaUpdateCoordinator(reload);
    coordinator.setUpdater(vi.fn(async () => {}));
    coordinator.enterRoute("menu");
    coordinator.needRefresh();
    await coordinator.activate();
    coordinator.enterRoute("game");
    coordinator.controllerChanged();
    expect(reload).not.toHaveBeenCalled();
    expect(coordinator.getState()).toBe("ready");
    coordinator.enterRoute("home");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("连续确认只调用一次 updateSW；reject 进入 error 后可重试", async () => {
    const update = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const coordinator = createPwaUpdateCoordinator();
    coordinator.setUpdater(update);
    coordinator.enterRoute("home");
    coordinator.needRefresh();
    await Promise.all([coordinator.activate(), coordinator.activate()]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(true);
    expect(coordinator.getState()).toBe("error");
    await coordinator.activate();
    expect(update).toHaveBeenCalledTimes(2);
    expect(coordinator.getState()).toBe("activating");
  });

  it("subscribe 立即收到快照且 unsubscribe 后不再通知", () => {
    const coordinator = createPwaUpdateCoordinator();
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({
      state: "idle", route: "home", visible: false, reloadReady: false,
    });
    unsubscribe();
    coordinator.needRefresh();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("注入 loader 固定 immediate/callback，并保存真实 updater", async () => {
    const update = vi.fn(async () => {});
    let options: {
      immediate: boolean;
      onNeedRefresh(): void;
      onNeedReload(): void;
      onRegisterError(error: unknown): void;
    } | undefined;
    const registerSW = vi.fn((value: typeof options) => { options = value; return update; });
    const reload = vi.fn();
    const coordinator = createPwaUpdateCoordinator(reload);
    await connectPwaRegistration(coordinator, async () => ({ registerSW }));
    expect(options?.immediate).toBe(true);
    options!.onNeedRefresh();
    expect(coordinator.getState()).toBe("ready");
    coordinator.enterRoute("home");
    await coordinator.activate();
    expect(update).toHaveBeenCalledWith(true);
    options!.onNeedReload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("捕获 loader 与注册错误，不产生未处理拒绝", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const coordinator = createPwaUpdateCoordinator();
    await expect(connectPwaRegistration(coordinator, async () => {
      throw new Error("import failed");
    })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("PWA registration module failed", expect.any(Error));

    let report!: (error: unknown) => void;
    await connectPwaRegistration(coordinator, async () => ({
      registerSW: (options) => {
        report = options.onRegisterError;
        return async () => {};
      },
    }));
    report(new Error("registration failed"));
    expect(warn).toHaveBeenCalledWith("PWA registration failed", expect.any(Error));
  });
});

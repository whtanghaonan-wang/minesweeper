export type AppRoute = "home" | "menu" | "game" | "result";
export type UpdateState = "idle" | "ready" | "deferred" | "activating" | "error";
export type UpdateFunction = (reloadPage?: boolean) => Promise<void>;

export interface UpdateSnapshot {
  state: UpdateState;
  route: AppRoute;
  visible: boolean;
  reloadReady: boolean;
}

export interface PwaUpdateCoordinator {
  getState(): UpdateState;
  getSnapshot(): UpdateSnapshot;
  shouldShowPrompt(): boolean;
  subscribe(listener: (snapshot: UpdateSnapshot) => void): () => void;
  setUpdater(update: UpdateFunction): void;
  enterRoute(route: AppRoute): void;
  needRefresh(): void;
  controllerChanged(): void;
  defer(): void;
  activate(): Promise<void>;
}

const isSafe = (route: AppRoute): boolean => route === "home" || route === "menu";

export function createPwaUpdateCoordinator(
  reloader: () => void = () => location.reload(),
): PwaUpdateCoordinator {
  let state: UpdateState = "idle";
  let route: AppRoute = "home";
  let updater: UpdateFunction | null = null;
  let activating: Promise<void> | null = null;
  let activationRequested = false;
  let controllerActivated = false;
  let reloaded = false;
  const listeners = new Set<(snapshot: UpdateSnapshot) => void>();

  const snapshot = (): UpdateSnapshot => ({
    state,
    route,
    visible: isSafe(route) && (state === "ready" || state === "activating" || state === "error"),
    reloadReady: controllerActivated,
  });
  const emit = (): void => {
    for (const listener of listeners) listener(snapshot());
  };
  const reloadOnce = (): void => {
    if (reloaded) return;
    reloaded = true;
    reloader();
  };

  return {
    getState: () => state,
    getSnapshot: snapshot,
    shouldShowPrompt: () => snapshot().visible,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => { listeners.delete(listener); };
    },
    setUpdater(update) {
      updater = update;
    },
    enterRoute(next) {
      if (state === "deferred" && next !== route) state = "ready";
      route = next;
      emit();
      if (controllerActivated && activationRequested && isSafe(route)) reloadOnce();
    },
    needRefresh() {
      if (state === "idle" || state === "error") state = "ready";
      emit();
    },
    controllerChanged() {
      controllerActivated = true;
      if (state !== "deferred" && (state !== "activating" || !isSafe(route))) state = "ready";
      emit();
      if (activationRequested && isSafe(route)) reloadOnce();
    },
    defer() {
      if (state === "ready" || state === "error") state = "deferred";
      emit();
    },
    activate() {
      if (controllerActivated && (state === "ready" || state === "error")) {
        activationRequested = true;
        if (isSafe(route)) reloadOnce();
        return Promise.resolve();
      }
      if (activating) return activating;
      if (state !== "ready" && state !== "error") return Promise.resolve();
      if (!updater) {
        state = "error";
        emit();
        return Promise.resolve();
      }
      activationRequested = true;
      state = "activating";
      emit();
      const runUpdate = updater;
      activating = Promise.resolve()
        .then(() => runUpdate(true))
        .catch(() => {
          activationRequested = false;
          state = "error";
          emit();
        })
        .finally(() => { activating = null; });
      return activating;
    },
  };
}

export type PwaModuleLoader = () => Promise<{
  registerSW(options: {
    immediate: boolean;
    onNeedRefresh(): void;
    onNeedReload(): void;
    onRegisterError(error: unknown): void;
  }): UpdateFunction;
}>;

export async function connectPwaRegistration(
  coordinator: PwaUpdateCoordinator,
  loader: PwaModuleLoader = () => import("virtual:pwa-register"),
): Promise<void> {
  try {
    const { registerSW } = await loader();
    const update = registerSW({
      immediate: true,
      onNeedRefresh: () => coordinator.needRefresh(),
      onNeedReload: () => coordinator.controllerChanged(),
      onRegisterError: (error) => console.warn("PWA registration failed", error),
    });
    coordinator.setUpdater(update);
  } catch (error) {
    console.warn("PWA registration module failed", error);
  }
}

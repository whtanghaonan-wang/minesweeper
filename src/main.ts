import "./ui/style.css";
import { createStorage } from "./core/storage";
import { LEVELS, type LevelSpec } from "./core/levels";
import { setMuted } from "./ui/audio";
import { showHome } from "./ui/home";
import { showMenu } from "./ui/menu";
import { showGame } from "./ui/game";
import { showResult } from "./ui/result";
import { endlessSpec } from "./core/endless";
import { mulberry32 } from "./core/rng";
import { setPersistenceWarning } from "./ui/persistence-warning";
import { applyReducedTransparency, createUiPrefs } from "./ui/ui-prefs";
import { installLiquidGlass } from "./ui/liquid-glass";

const APP_VERSION = "2.2.0";
const root = document.querySelector<HTMLDivElement>("#app")!;

function localStorageBackend(): globalThis.Storage | undefined {
  try {
    const probe = "__minesweeper_probe__";
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return undefined;
  }
}

const backend = localStorageBackend();
const storage = createStorage(backend);
const uiPrefs = createUiPrefs(backend);
applyReducedTransparency(uiPrefs.load().reducedTransparency);
const liquidGlass = installLiquidGlass(document);
window.addEventListener("pagehide", (event) => {
  if (event.persisted) liquidGlass.cancelAll();
  else liquidGlass.destroy();
});
let persistenceWarning = backend === undefined;

function syncPersistenceWarning(): void {
  setPersistenceWarning(persistenceWarning);
}

function notePersisted(persisted: boolean): void {
  persistenceWarning = !persisted;
  syncPersistenceWarning();
}

function resultRestoreFocus(): HTMLElement | null {
  return root.querySelector<HTMLElement>("[data-result-focus]") ??
    (document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
      ? document.activeElement : null);
}

function retryPending(): void {
  const result = storage.flushPending();
  if (result === "saved") persistenceWarning = false;
  else if (result === "failed") persistenceWarning = true;
  syncPersistenceWarning();
}

setMuted(!storage.load().soundOn);

function gotoHome(): void {
  retryPending();
  showHome(root, {
    storage,
    uiPrefs,
    version: APP_VERSION,
    onContinue: gotoGame,
    onSelect: gotoMenu,
    onEndless: gotoEndless,
    onPersisted: notePersisted,
  });
}

function gotoMenu(): void {
  retryPending();
  showMenu(root, {
    storage,
    persistWarning: backend === undefined,
    onPlay: gotoGame,
    onBack: gotoHome,
  });
}

function gotoGame(level: LevelSpec): void {
  showGame(root, {
    level,
    uiPrefs,
    onExit: gotoMenu,
    onToggleSound: (on) => notePersisted(storage.setSoundOn(on)),
    onFinish: (result) => {
      const next = LEVELS.find((l) => l.id === level.id + 1);
      const rec = result.won ? storage.recordWin(level.id, result.timeSec) : null;
      if (rec !== null) notePersisted(rec.persisted);
      showResult({
        won: result.won,
        reason: result.reason,
        timeSec: result.timeSec,
        newBest: rec?.newBest ?? false,
        persisted: rec?.persisted ?? !persistenceWarning,
        hasNext: result.won && next !== undefined,
        backgroundRoot: root,
        restoreFocus: resultRestoreFocus(),
        onNext: () => next && gotoGame(next),
        onRetry: () => gotoGame(level),
        onMenu: gotoMenu,
      });
    },
  });
}

function gotoEndless(): void {
  const streak = storage.load().endless.streak;
  const level = endlessSpec(streak, mulberry32((Math.random() * 2 ** 32) >>> 0));
  showGame(root, {
    level,
    mode: { kind: "endless", streak },
    uiPrefs,
    onExit: gotoHome, // 中途退出:本局不计、连胜保留(规格 §3.3)
    onToggleSound: (on) => notePersisted(storage.setSoundOn(on)),
    onFinish: (result) => {
      if (result.won) {
        const rec = storage.recordEndlessWin();
        notePersisted(rec.persisted);
        showResult({
          won: true,
          timeSec: result.timeSec,
          newBest: rec.newBest,
          persisted: rec.persisted,
          hasNext: true,
          endless: { streak: rec.streak },
          backgroundRoot: root,
          restoreFocus: resultRestoreFocus(),
          onNext: gotoEndless,
          onRetry: gotoEndless,
          onMenu: gotoHome,
        });
      } else {
        const ended = storage.load().endless.streak;
        const rec = storage.recordEndlessLoss();
        notePersisted(rec.persisted);
        showResult({
          won: false,
          reason: result.reason,
          timeSec: result.timeSec,
          newBest: false,
          persisted: rec.persisted,
          hasNext: false,
          endless: { streak: ended },
          backgroundRoot: root,
          restoreFocus: resultRestoreFocus(),
          onNext: gotoEndless,
          onRetry: gotoEndless, // 再来一盘:连胜已归零,回起步盘
          onMenu: gotoHome,
        });
      }
    },
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") retryPending();
});
syncPersistenceWarning();
gotoHome();

// PWA:仅在 Web 环境(https 或本地预览)注册 Service Worker;Tauri 桌面端不需要
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}

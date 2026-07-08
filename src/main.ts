import "./ui/style.css";
import { createStorage } from "./core/storage";
import { LEVELS, type LevelSpec } from "./core/levels";
import { setMuted } from "./ui/audio";
import { showHome } from "./ui/home";
import { showMenu } from "./ui/menu";
import { showGame } from "./ui/game";
import { showResult } from "./ui/result";

const APP_VERSION = "2.1.0";
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
setMuted(!storage.load().soundOn);

function gotoHome(): void {
  showHome(root, {
    storage,
    version: APP_VERSION,
    onContinue: gotoGame,
    onSelect: gotoMenu,
  });
}

function gotoMenu(): void {
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
    onExit: gotoMenu,
    onToggleSound: (on) => void storage.setSoundOn(on),
    onFinish: (result) => {
      const next = LEVELS.find((l) => l.id === level.id + 1);
      const rec = result.won ? storage.recordWin(level.id, result.timeSec) : null;
      showResult({
        won: result.won,
        reason: result.reason,
        timeSec: result.timeSec,
        newBest: rec?.newBest ?? false,
        persisted: rec?.persisted ?? true,
        hasNext: result.won && next !== undefined,
        onNext: () => next && gotoGame(next),
        onRetry: () => gotoGame(level),
        onMenu: gotoMenu,
      });
    },
  });
}

gotoHome();

// PWA:仅在 Web 环境(https 或本地预览)注册 Service Worker;Tauri 桌面端不需要
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}

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
setMuted(!storage.load().soundOn);

function gotoHome(): void {
  showHome(root, {
    storage,
    version: APP_VERSION,
    onContinue: gotoGame,
    onSelect: gotoMenu,
    onEndless: gotoEndless,
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

function gotoEndless(): void {
  const streak = storage.load().endless.streak;
  const level = endlessSpec(streak, mulberry32((Math.random() * 2 ** 32) >>> 0));
  showGame(root, {
    level,
    mode: { kind: "endless", streak },
    onExit: gotoHome, // 中途退出:本局不计、连胜保留(规格 §3.3)
    onToggleSound: (on) => void storage.setSoundOn(on),
    onFinish: (result) => {
      if (result.won) {
        const rec = storage.recordEndlessWin();
        showResult({
          won: true,
          timeSec: result.timeSec,
          newBest: rec.newBest,
          persisted: true,
          hasNext: true,
          endless: { streak: rec.streak },
          onNext: gotoEndless,
          onRetry: gotoEndless,
          onMenu: gotoHome,
        });
      } else {
        const ended = storage.load().endless.streak;
        storage.recordEndlessLoss();
        showResult({
          won: false,
          reason: result.reason,
          timeSec: result.timeSec,
          newBest: false,
          persisted: true,
          hasNext: false,
          endless: { streak: ended },
          onNext: gotoEndless,
          onRetry: gotoEndless, // 再来一盘:连胜已归零,回起步盘
          onMenu: gotoHome,
        });
      }
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

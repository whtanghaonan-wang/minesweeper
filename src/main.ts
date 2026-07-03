import "./ui/style.css";
import { createStorage } from "./core/storage";
import { LEVELS, type LevelSpec } from "./core/levels";
import { showMenu } from "./ui/menu";
import { showGame } from "./ui/game";
import { showResult } from "./ui/result";

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

function gotoMenu(): void {
  showMenu(root, { storage, persistWarning: backend === undefined, onPlay: gotoGame });
}

function gotoGame(level: LevelSpec): void {
  showGame(root, {
    level,
    onExit: gotoMenu,
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

gotoMenu();

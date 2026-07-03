import "./ui/style.css";
import { createStorage } from "./core/storage";
import type { LevelSpec } from "./core/levels";
import { showMenu } from "./ui/menu";
import { showGame } from "./ui/game";

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
      // Task 8 接入结算弹窗
      console.log("finish", result);
      gotoMenu();
    },
  });
}

gotoMenu();

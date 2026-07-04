import { LEVELS, TIER_NAMES, type LevelSpec, type Tier } from "../core/levels";
import type { GameStorage } from "../core/storage";
import { fmtTime } from "./format";

export interface MenuDeps {
  storage: GameStorage;
  /** 存档降级为内存态时为 true，用于提示成绩不会保存 */
  persistWarning?: boolean;
  onPlay(level: LevelSpec): void;
}

const TIER_ORDER: Tier[] = ["easy", "challenge", "hard", "expert", "abyss"];
const TIER_COLS: Record<Tier, number> = { easy: 4, challenge: 4, hard: 4, expert: 4, abyss: 4 };

export function showMenu(root: HTMLElement, deps: MenuDeps): void {
  const save = deps.storage.load();

  const menu = document.createElement("div");
  menu.className = "menu";

  const head = document.createElement("header");
  head.className = "menu-head";
  head.innerHTML = `<h1>扫雷</h1><p class="menu-sub">无猜 · 十关 · 三档</p>`;
  menu.appendChild(head);

  if (deps.persistWarning) {
    const note = document.createElement("p");
    note.className = "menu-note";
    note.textContent = "当前无法读写本地存储，成绩与进度只在本次游戏内有效";
    menu.appendChild(note);
  }

  for (const tier of TIER_ORDER) {
    const levels = LEVELS.filter((l) => l.tier === tier);
    const section = document.createElement("section");
    section.className = `tier tier-${tier}`;

    const first = levels[0]!.id;
    const last = levels[levels.length - 1]!.id;
    const headEl = document.createElement("div");
    headEl.className = "tier-head";
    headEl.innerHTML = `<span class="tier-dot"></span><h2>${TIER_NAMES[tier]}</h2><span class="tier-range num">第 ${first}–${last} 关</span>`;
    section.appendChild(headEl);

    const grid = document.createElement("div");
    grid.className = "tier-grid";
    grid.style.setProperty("--cols", String(TIER_COLS[tier]));
    for (const level of levels) grid.appendChild(levelTile(level, save.unlockedLevel, save.bestTimes[level.id], deps));
    section.appendChild(grid);
    menu.appendChild(section);
  }

  root.replaceChildren(menu);
}

function levelTile(
  level: LevelSpec,
  unlockedLevel: number,
  best: number | undefined,
  deps: MenuDeps,
): HTMLButtonElement {
  const locked = level.id > unlockedLevel;
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = `level-tile${locked ? " locked" : ""}`;

  const num = document.createElement("span");
  num.className = "lv-num";
  num.textContent = String(level.id);
  const sub = document.createElement("span");
  sub.className = "lv-best num";
  sub.textContent = locked ? "🔒" : best !== undefined ? fmtTime(best) : "未通关";

  tile.append(num, sub);
  if (locked) {
    tile.disabled = true;
    tile.setAttribute("aria-label", `第 ${level.id} 关（未解锁）`);
  } else {
    tile.setAttribute(
      "aria-label",
      `第 ${level.id} 关，${best !== undefined ? `最好成绩 ${fmtTime(best)}` : "未通关"}`,
    );
    tile.addEventListener("click", () => deps.onPlay(level));
  }
  return tile;
}

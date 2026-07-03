import {
  type Board,
  chord,
  flaggedCount,
  isWin,
  reveal,
  toggleFlag,
} from "../core/board";
import { generate } from "../core/generator";
import { TIER_NAMES, type LevelSpec } from "../core/levels";
import { mulberry32 } from "../core/rng";
import { fmtTime } from "./format";

export interface GameResult {
  won: boolean;
  reason?: "mine" | "time";
  timeSec: number;
}

export interface GameDeps {
  level: LevelSpec;
  onExit(): void;
  onFinish(result: GameResult): void;
}

type Mode = "dig" | "flag";

const LONG_PRESS_MS = 350;
const CASCADE_STEP_MS = 12;
const CASCADE_MAX_MS = 240;
const FINISH_PAUSE_MS = 700;

export function showGame(root: HTMLElement, deps: GameDeps): void {
  const { level } = deps;
  // 宽屏（桌面/横屏）交换行列，竖屏保持原始配置
  const wide = window.innerWidth > window.innerHeight;
  const w = wide ? level.height : level.width;
  const h = wide ? level.width : level.height;
  const size = w * h;

  let board: Board | null = null;
  let finished = false;
  let mode: Mode = "dig";
  let deadline = 0;
  let startedAt = 0;
  let timerId: ReturnType<typeof setInterval> | null = null;

  // ===== DOM =====
  const game = document.createElement("div");
  game.className = "game";

  const top = document.createElement("header");
  top.className = "game-top";
  const backBtn = button("pill back", "←", exit);
  backBtn.setAttribute("aria-label", "返回选关");
  const title = document.createElement("div");
  title.className = "game-title";
  title.innerHTML = `<b>第 ${level.id} 关</b><span class="game-tier tier-${level.tier}">${TIER_NAMES[level.tier]}</span>`;
  const stats = document.createElement("div");
  stats.className = "game-stats";
  const mineStat = document.createElement("span");
  mineStat.className = "pill stat num";
  const timeStat = document.createElement("span");
  timeStat.className = "pill stat num";
  stats.append(mineStat, timeStat);
  top.append(backBtn, title, stats);

  const boardWrap = document.createElement("div");
  boardWrap.className = "board-wrap";
  const boardEl = document.createElement("div");
  boardEl.className = "board";
  boardEl.style.setProperty("--w", String(w));
  boardEl.style.setProperty("--h", String(h));
  boardWrap.appendChild(boardEl);

  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < size; i++) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "cell";
    c.dataset["i"] = String(i);
    cells.push(c);
    boardEl.appendChild(c);
  }

  const bottom = document.createElement("footer");
  bottom.className = "game-bottom";
  const modeToggle = document.createElement("div");
  modeToggle.className = "mode-toggle";
  modeToggle.setAttribute("role", "group");
  modeToggle.setAttribute("aria-label", "点按模式");
  const digBtn = button("mode-btn active", "⛏ 挖开", () => setMode("dig"));
  const flagBtn = button("mode-btn", "🚩 插旗", () => setMode("flag"));
  modeToggle.append(digBtn, flagBtn);
  const restartBtn = button("pill restart", "↻ 重开", restart);
  bottom.append(modeToggle, restartBtn);

  game.append(top, boardWrap, bottom);
  root.replaceChildren(game);

  updateStats();
  updateTimeDisplay(level.timeLimitSec);

  // ===== 输入 =====
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;

  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

  boardEl.addEventListener("pointerdown", (e) => {
    const i = cellIndex(e.target);
    if (i === null || finished) return;
    if (e.pointerType === "mouse") {
      if (e.button === 2) act(i, "flag");
      else if (e.button === 0) act(i, "dig");
      return;
    }
    // 触摸：长按执行另一模式
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      navigator.vibrate?.(10);
      act(i, mode === "dig" ? "flag" : "dig");
    }, LONG_PRESS_MS);
  });

  boardEl.addEventListener("pointerup", (e) => {
    const i = cellIndex(e.target);
    clearPress();
    if (i === null || finished || e.pointerType === "mouse") return;
    if (!longPressed) act(i, mode);
  });

  boardEl.addEventListener("pointercancel", clearPress);
  boardEl.addEventListener("pointerleave", clearPress, true);

  function clearPress(): void {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function cellIndex(target: EventTarget | null): number | null {
    if (!(target instanceof HTMLElement)) return null;
    const v = target.closest<HTMLElement>(".cell")?.dataset["i"];
    return v === undefined ? null : Number(v);
  }

  // ===== 动作 =====
  function act(i: number, action: Mode): void {
    if (finished) return;
    if (board === null) {
      if (action === "flag") return; // 开局前无处落旗
      board = generate(level, toLogical(i), mulberry32((Math.random() * 2 ** 32) >>> 0));
      startTimer();
    }
    const b = board;
    const li = toLogical(i);

    // 已开数字格：无论模式，点按一律尝试 chord
    if (!b.revealed[li] && action === "flag") {
      toggleFlag(b, li);
      syncCell(i);
      updateStats();
      return;
    }

    const r = b.revealed[li] ? chord(b, li) : reveal(b, li);
    if (r.changed.length > 0) syncChanged(r.changed);
    updateStats();
    if (r.exploded) return lose("mine", li);
    if (isWin(b)) return win();
  }

  function setMode(m: Mode): void {
    mode = m;
    digBtn.classList.toggle("active", m === "dig");
    flagBtn.classList.toggle("active", m === "flag");
  }

  // ===== 计时 =====
  function startTimer(): void {
    startedAt = Date.now();
    deadline = startedAt + level.timeLimitSec * 1000;
    timerId = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      updateTimeDisplay(left);
      if (left <= 0) lose("time", null);
    }, 250);
  }

  function stopTimer(): void {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function elapsedSec(): number {
    return Math.min(level.timeLimitSec, Math.round((Date.now() - startedAt) / 1000));
  }

  function updateTimeDisplay(left: number): void {
    timeStat.textContent = `⏱ ${fmtTime(left)}`;
    timeStat.classList.toggle("low", left <= 30);
  }

  function updateStats(): void {
    const left = board === null ? level.mines : level.mines - flaggedCount(board);
    mineStat.textContent = `💣 ${left}`;
  }

  // ===== 终局 =====
  function win(): void {
    finished = true;
    stopTimer();
    const b = board!;
    for (let li = 0; li < size; li++) if (b.mine[li] && !b.flagged[li]) toggleFlag(b, li);
    syncAll();
    updateStats();
    const timeSec = elapsedSec();
    setTimeout(() => deps.onFinish({ won: true, timeSec }), FINISH_PAUSE_MS);
  }

  function lose(reason: "mine" | "time", boomLogical: number | null): void {
    if (finished) return;
    finished = true;
    stopTimer();
    const b = board;
    if (b) {
      for (let li = 0; li < size; li++) {
        const el = cells[toVisual(li)]!;
        if (b.mine[li] && !b.flagged[li] && !b.revealed[li]) {
          el.classList.add("open", "mine-shown");
          el.textContent = "💣";
        } else if (!b.mine[li] && b.flagged[li]) {
          el.classList.add("wrong");
          el.textContent = "✕";
        }
      }
      if (boomLogical !== null) {
        const el = cells[toVisual(boomLogical)]!;
        el.classList.add("boom");
        el.textContent = "💥";
      }
    }
    const timeSec = startedAt === 0 ? 0 : elapsedSec();
    setTimeout(() => deps.onFinish({ won: false, reason, timeSec }), FINISH_PAUSE_MS);
  }

  function exit(): void {
    stopTimer();
    finished = true;
    deps.onExit();
  }

  function restart(): void {
    stopTimer();
    showGame(root, deps);
  }

  // ===== 渲染 =====
  // 视觉索引（屏幕网格）与逻辑索引（棋盘数据）在宽屏下转置
  function toLogical(vi: number): number {
    if (!wide) return vi;
    const x = vi % w;
    const y = Math.floor(vi / w);
    return x * level.width + y;
  }

  function toVisual(li: number): number {
    if (!wide) return li;
    const x = li % level.width;
    const y = Math.floor(li / level.width);
    return x * w + y;
  }

  function syncChanged(changedLogical: number[]): void {
    changedLogical.forEach((li, k) => {
      const vi = toVisual(li);
      syncCell(vi);
      const el = cells[vi]!;
      el.classList.add("pop");
      el.style.animationDelay = `${Math.min(k * CASCADE_STEP_MS, CASCADE_MAX_MS)}ms`;
    });
  }

  function syncAll(): void {
    for (let vi = 0; vi < size; vi++) syncCell(vi);
  }

  function syncCell(vi: number): void {
    const b = board;
    const el = cells[vi]!;
    if (b === null) return;
    const li = toLogical(vi);
    if (b.revealed[li] && !b.mine[li]) {
      const n = b.adjacent[li];
      el.className = `cell open${n > 0 ? ` n${n}` : ""}`;
      el.textContent = n > 0 ? String(n) : "";
    } else if (b.flagged[li]) {
      el.className = "cell flagged";
      el.textContent = "🚩";
    } else {
      el.className = "cell";
      el.textContent = "";
    }
  }

  function button(cls: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cls;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }
}

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
import {
  isMuted,
  playBlank,
  playBoom,
  playLose,
  playNumber,
  playWin,
  setMuted,
  unlock,
} from "./audio";
import { fmtTime } from "./format";
import {
  BASE_CELL_PX,
  BOARD_PAD,
  CELL_GAP,
  clampView,
  createGestures,
  fitScale,
  hitCell,
  zoomAt,
  type GestureAction,
  type Metrics,
  type ViewState,
} from "./viewport";

export interface GameResult {
  won: boolean;
  reason?: "mine" | "time";
  timeSec: number;
}

export interface GameDeps {
  level: LevelSpec;
  onExit(): void;
  onFinish(result: GameResult): void;
  onToggleSound(on: boolean): void;
}

type Mode = "dig" | "flag";

const LONG_PRESS_MS = 350;
const CASCADE_STEP_MS = 12;
const CASCADE_MAX_MS = 240;
const FINISH_PAUSE_MS = 700;
const WHEEL_STEP = 1.15;

export function showGame(root: HTMLElement, deps: GameDeps): void {
  const { level } = deps;
  // 宽屏（桌面/横屏）交换行列，竖屏保持原始配置
  const wide = window.innerWidth > window.innerHeight;
  const w = wide ? level.height : level.width;
  const h = wide ? level.width : level.height;
  const size = w * h;

  let board: Board | null = null;
  const preFlags = new Set<number>();
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
  const soundBtn = button("pill stat game-sound", "", toggleSound);
  stats.appendChild(soundBtn);
  top.append(backBtn, title, stats);

  const boardVp = document.createElement("div");
  boardVp.className = "board-viewport";
  const boardEl = document.createElement("div");
  boardEl.className = "board";
  boardEl.style.setProperty("--w", String(w));
  const boardW = BOARD_PAD * 2 + w * BASE_CELL_PX + (w - 1) * CELL_GAP;
  const boardH = BOARD_PAD * 2 + h * BASE_CELL_PX + (h - 1) * CELL_GAP;
  boardEl.style.width = `${boardW}px`;
  boardEl.style.height = `${boardH}px`;
  boardVp.appendChild(boardEl);

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

  const hint = document.createElement("p");
  hint.className = "pc-hint";
  hint.textContent = "左键挖开 · 右键插旗 · 滚轮缩放 · 拖动平移";
  game.append(top, boardVp, bottom, hint);
  root.replaceChildren(game);

  updateStats();
  updateTimeDisplay(level.timeLimitSec);

  // ===== 视口（缩放/平移）=====
  let view: ViewState = { scale: 1, tx: 0, ty: 0 };
  let lastFit = 1;

  function metrics(): Metrics {
    return { viewW: boardVp.clientWidth, viewH: boardVp.clientHeight, boardW, boardH };
  }

  function applyView(): void {
    boardEl.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  }

  function refit(): void {
    const m = metrics();
    lastFit = fitScale(m);
    view = clampView({ scale: lastFit, tx: 0, ty: 0 }, m);
    applyView();
  }

  function onResize(): void {
    if (!game.isConnected) {
      window.removeEventListener("resize", onResize); // 页面已被替换，自清理
      return;
    }
    const m = metrics();
    const wasFit = Math.abs(view.scale - lastFit) < 1e-3;
    lastFit = fitScale(m);
    view = wasFit
      ? clampView({ scale: lastFit, tx: 0, ty: 0 }, m)
      : clampView({ ...view, scale: zoomAt(view, m, 0, 0, 1).scale }, m);
    applyView();
  }

  syncSoundBtn();
  refit(); // jsdom 下尺寸为 0，fitScale 回退 1，保持确定性
  requestAnimationFrame(refit); // 真实浏览器等布局完成后精确适配
  window.addEventListener("resize", onResize);

  // ===== 输入：手势状态机接线 =====
  const gestures = createGestures();
  let longTimer: ReturnType<typeof setTimeout> | null = null;
  let downCellVi: number | null = null; // 手势起点所在格（视觉索引）

  boardVp.addEventListener("contextmenu", (e) => e.preventDefault());

  function vpPoint(e: MouseEvent): { x: number; y: number } {
    const r = boardVp.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function pid(e: Event): number {
    return (e as PointerEvent).pointerId ?? 0;
  }

  function isTouch(e: Event): boolean {
    return (e as PointerEvent).pointerType !== "mouse";
  }

  function run(actions: GestureAction[]): void {
    for (const a of actions) {
      switch (a.type) {
        case "pan": {
          view = clampView({ scale: view.scale, tx: view.tx + a.dx, ty: view.ty + a.dy }, metrics());
          applyView();
          break;
        }
        case "pinch": {
          const m = metrics();
          view = zoomAt(view, m, a.cx, a.cy, a.factor);
          view = clampView({ scale: view.scale, tx: view.tx + a.dx, ty: view.ty + a.dy }, m);
          applyView();
          break;
        }
        case "tap": {
          if (downCellVi === null || finished) break;
          const action: Mode = a.touch
            ? a.alt
              ? mode === "dig"
                ? "flag"
                : "dig"
              : mode
            : a.alt
              ? "flag"
              : "dig";
          if (a.touch && a.alt) navigator.vibrate?.(10);
          act(downCellVi, action);
          break;
        }
        case "startTimer": {
          longTimer = setTimeout(() => run(gestures.handle({ type: "longpress" })), LONG_PRESS_MS);
          break;
        }
        case "cancelTimer": {
          if (longTimer !== null) {
            clearTimeout(longTimer);
            longTimer = null;
          }
          break;
        }
      }
    }
  }

  boardVp.addEventListener("pointerdown", (e) => {
    unlock();
    const p = vpPoint(e);
    downCellVi = hitCell(p.x, p.y, view, w, h);
    boardVp.setPointerCapture?.(pid(e));
    run(gestures.handle({ type: "down", id: pid(e), x: p.x, y: p.y, touch: isTouch(e), button: e.button }));
  });

  boardVp.addEventListener("pointermove", (e) => {
    const p = vpPoint(e);
    run(gestures.handle({ type: "move", id: pid(e), x: p.x, y: p.y }));
  });

  boardVp.addEventListener("pointerup", (e) => {
    const p = vpPoint(e);
    run(gestures.handle({ type: "up", id: pid(e), x: p.x, y: p.y }));
  });

  boardVp.addEventListener("pointercancel", (e) => {
    run(gestures.handle({ type: "cancel", id: pid(e) }));
  });

  boardVp.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = vpPoint(e);
      view = zoomAt(view, metrics(), p.x, p.y, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
      applyView();
    },
    { passive: false },
  );

  // ===== 动作 =====
  function act(i: number, action: Mode): void {
    if (finished) return;
    const liEarly = toLogical(i);
    if (board === null) {
      if (action === "flag") {
        // 开局前预旗：只记标记，不生成盘面
        if (preFlags.has(liEarly)) preFlags.delete(liEarly);
        else preFlags.add(liEarly);
        syncCell(i);
        updateStats();
        return;
      }
      if (preFlags.has(liEarly)) return; // 旗格不可挖，也不触发开局
      board = generate(level, liEarly, mulberry32((Math.random() * 2 ** 32) >>> 0));
      for (const li of preFlags) toggleFlag(board, li); // 预旗原样落盘
      preFlags.clear();
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

    const wasOpen = b.revealed[li];
    const r = wasOpen ? chord(b, li) : reveal(b, li);
    if (r.changed.length > 0 && !r.exploded) {
      if (!wasOpen && b.adjacent[li] === 0) playBlank();
      else playNumber();
    }
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

  function syncSoundBtn(): void {
    soundBtn.textContent = isMuted() ? "🔇" : "🔊";
    soundBtn.setAttribute("aria-label", isMuted() ? "开启音效" : "关闭音效");
  }

  function toggleSound(): void {
    const nextMuted = !isMuted();
    setMuted(nextMuted);
    deps.onToggleSound(!nextMuted);
    syncSoundBtn();
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
    const left = board === null ? level.mines - preFlags.size : level.mines - flaggedCount(board);
    mineStat.textContent = `💣 ${left}`;
  }

  // ===== 终局 =====
  function win(): void {
    finished = true;
    stopTimer();
    window.removeEventListener("resize", onResize);
    playWin();
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
    window.removeEventListener("resize", onResize);
    if (reason === "mine") playBoom();
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
    setTimeout(() => {
      playLose();
      deps.onFinish({ won: false, reason, timeSec });
    }, FINISH_PAUSE_MS);
  }

  function exit(): void {
    stopTimer();
    finished = true;
    window.removeEventListener("resize", onResize);
    deps.onExit();
  }

  function restart(): void {
    finished = true;
    stopTimer();
    window.removeEventListener("resize", onResize);
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
    const el = cells[vi]!;
    if (board === null) {
      const li = toLogical(vi);
      if (preFlags.has(li)) {
        el.className = "cell flagged";
        el.textContent = "🚩";
      } else {
        el.className = "cell";
        el.textContent = "";
      }
      return;
    }
    const b = board;
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

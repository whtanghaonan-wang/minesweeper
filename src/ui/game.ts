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
  playFlag,
  playLose,
  playNumber,
  playUnflag,
  playWin,
  setMuted,
  unlock,
} from "./audio";
import {
  cellAriaLabel,
  createBoardLayout,
  gridKeyTarget,
  selectCascadeCells,
  toLogicalIndex,
  toVisualIndex,
  type CellA11yState,
} from "./board-grid";
import { fmtTime } from "./format";
import { restartFiniteAnimation, restartFiniteAnimations } from "./motion";
import { createUiPrefs, type UiPrefsStore } from "./ui-prefs";
import {
  BASE_CELL_PX,
  BOARD_PAD,
  CELL_GAP,
  OPERABLE_CELL_PX,
  centerBoardPoint,
  clampView,
  createGestures,
  fitScale,
  hitCell,
  maxScale,
  scaleForMode,
  zoomAt,
  type GestureAction,
  type Metrics,
  type ViewMode,
  type ViewState,
} from "./viewport";

export interface GameResult {
  won: boolean;
  reason?: "mine" | "time";
  timeSec: number;
}

export type GameMode = { kind: "campaign" } | { kind: "endless"; streak: number };

export interface GameDeps {
  level: LevelSpec;
  mode?: GameMode;
  uiPrefs?: UiPrefsStore;
  onExit(): void;
  onFinish(result: GameResult): void;
  onToggleSound(on: boolean): void;
}

type Mode = "dig" | "flag";

const LONG_PRESS_MS = 350;
const FINISH_PAUSE_MS = 700;
const WHEEL_STEP = 1.15;

export function showGame(root: HTMLElement, deps: GameDeps): void {
  const { level } = deps;
  const uiPrefs = deps.uiPrefs ?? createUiPrefs();
  let layout = createBoardLayout(level.width, level.height, window.innerWidth > window.innerHeight);
  let w = layout.cols;
  let h = layout.rows;
  const size = level.width * level.height;
  let activeLogical = 0;
  let downCellLogical: number | null = null;

  let board: Board | null = null;
  const preFlags = new Set<number>();
  let finished = false;
  let mode: Mode = "dig";
  let deadline = 0;
  let startedAt = 0;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFinish: GameResult | null = null;

  const game = document.createElement("div");
  game.className = "game";

  const top = document.createElement("header");
  top.className = "game-top glass-compact";
  top.dataset["liquidGlass"] = "";
  const backBtn = button("pill back", "←", exit);
  backBtn.setAttribute("aria-label", "返回选关");
  const title = document.createElement("div");
  title.className = "game-title";
  title.tabIndex = -1;
  const gameMode: GameMode = deps.mode ?? { kind: "campaign" };
  title.innerHTML =
    gameMode.kind === "endless"
      ? `<b>♾ 无尽</b><span class="game-tier tier-endless">连胜 ${gameMode.streak}</span>`
      : `<b>第 ${level.id} 关</b><span class="game-tier tier-${level.tier}">${TIER_NAMES[level.tier]}</span>`;
  const stats = document.createElement("div");
  stats.className = "game-stats";
  const mineStat = document.createElement("span");
  mineStat.className = "pill stat num";
  mineStat.setAttribute("aria-live", "polite");
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
  boardVp.appendChild(boardEl);

  const cells: HTMLButtonElement[] = Array.from({ length: size }, (_, logical) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    cell.dataset["logicalIndex"] = String(logical);
    return cell;
  });

  const bottom = document.createElement("footer");
  bottom.className = "game-bottom";
  const bottomActions = document.createElement("div");
  bottomActions.className = "bottom-actions glass-compact";
  bottomActions.dataset["liquidGlass"] = "";
  const modeToggle = document.createElement("div");
  modeToggle.className = "mode-toggle";
  modeToggle.setAttribute("role", "group");
  modeToggle.setAttribute("aria-label", "点按模式");
  const digBtn = button("mode-btn active", "⛏ 挖开", () => setMode("dig"));
  const flagBtn = button("mode-btn", "🚩 插旗", () => setMode("flag"));
  modeToggle.append(digBtn, flagBtn);

  const viewControls = document.createElement("div");
  viewControls.className = "view-controls";
  viewControls.setAttribute("role", "group");
  viewControls.setAttribute("aria-label", "棋盘显示尺寸");
  const fitBtn = button("view-mode-btn", "适合屏幕", () => setViewMode("fit"));
  const operableBtn = button("view-mode-btn", "可操作尺寸", () => setViewMode("operable"));
  viewControls.append(fitBtn, operableBtn);

  const restartBtn = button("pill restart", "↻ 重开", restart);
  bottomActions.replaceChildren(modeToggle, viewControls, restartBtn);
  const hint = document.createElement("p");
  hint.className = "pc-hint";
  hint.textContent = "左键挖开 · 右键插旗 · 滚轮缩放 · 拖动平移";
  bottom.append(bottomActions, hint);
  game.append(top, boardVp, bottom);

  let boardW = 0;
  let boardH = 0;

  function updateBoardMetrics(): void {
    boardW = BOARD_PAD * 2 + layout.cols * BASE_CELL_PX + (layout.cols - 1) * CELL_GAP;
    boardH = BOARD_PAD * 2 + layout.rows * BASE_CELL_PX + (layout.rows - 1) * CELL_GAP;
    boardEl.style.width = `${boardW}px`;
    boardEl.style.height = `${boardH}px`;
  }

  function renderGridRows(): void {
    boardEl.replaceChildren();
    boardEl.setAttribute("role", "grid");
    boardEl.setAttribute("aria-label", "扫雷棋盘");
    boardEl.setAttribute("aria-rowcount", String(layout.rows));
    boardEl.setAttribute("aria-colcount", String(layout.cols));
    for (let row = 0; row < layout.rows; row++) {
      const rowEl = document.createElement("div");
      rowEl.className = "board-row";
      rowEl.setAttribute("role", "row");
      rowEl.setAttribute("aria-rowindex", String(row + 1));
      for (let col = 0; col < layout.cols; col++) {
        const visual = row * layout.cols + col;
        const logical = toLogicalIndex(visual, layout);
        const cell = cells[logical]!;
        cell.dataset["i"] = String(visual);
        cell.setAttribute("aria-rowindex", String(row + 1));
        cell.setAttribute("aria-colindex", String(col + 1));
        cell.tabIndex = logical === activeLogical ? 0 : -1;
        rowEl.appendChild(cell);
      }
      boardEl.appendChild(rowEl);
    }
  }

  updateBoardMetrics();
  renderGridRows();
  syncAll();
  root.replaceChildren(game);
  updateStats();
  updateTimeDisplay(level.timeLimitSec);

  let view: ViewState = { scale: 1, tx: 0, ty: 0 };
  let viewMode: ViewMode = "fit";
  let userAdjusted = false;

  function metrics(): Metrics {
    return {
      viewW: boardVp.clientWidth,
      viewH: boardVp.clientHeight,
      boardW,
      boardH,
      insetTop: top.offsetHeight,
      insetBottom: bottom.offsetHeight,
    };
  }

  function applyView(): void {
    boardEl.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  }

  function setViewMode(nextMode: ViewMode): void {
    viewMode = nextMode;
    userAdjusted = false;
    const m = metrics();
    const scale = scaleForMode(nextMode, m);
    const visual = toVisualIndex(activeLogical, layout);
    const boardX = BOARD_PAD + (visual % layout.cols) * (BASE_CELL_PX + CELL_GAP) + BASE_CELL_PX / 2;
    const boardY = BOARD_PAD + Math.floor(visual / layout.cols) *
      (BASE_CELL_PX + CELL_GAP) + BASE_CELL_PX / 2;
    view = boardVp.clientWidth <= 0 || boardVp.clientHeight <= 0
      ? clampView({ scale, tx: 0, ty: 0 }, m)
      : centerBoardPoint({ ...view, scale }, m, boardX, boardY,
        boardVp.clientWidth / 2,
        top.offsetHeight + (boardVp.clientHeight - top.offsetHeight - bottom.offsetHeight) / 2);
    fitBtn.setAttribute("aria-pressed", String(viewMode === "fit"));
    operableBtn.setAttribute("aria-pressed", String(viewMode === "operable"));
    applyView();
  }

  function resizeWithoutTranspose(): void {
    const m = metrics();
    if (!userAdjusted) {
      view = clampView({ scale: scaleForMode(viewMode, m), tx: 0, ty: 0 }, m);
    } else {
      const scale = Math.min(maxScale(m), Math.max(fitScale(m), view.scale));
      view = clampView({ ...view, scale }, m);
    }
    applyView();
    if (m.viewW > 0 && m.viewH > 0) ensureLogicalVisible(activeLogical);
  }

  function ensureLogicalVisible(logical: number): void {
    const focusGutter = 4;
    const visual = toVisualIndex(logical, layout);
    const col = visual % layout.cols;
    const row = Math.floor(visual / layout.cols);
    const left = view.tx + (BOARD_PAD + col * (BASE_CELL_PX + CELL_GAP)) * view.scale;
    const topY = view.ty + (BOARD_PAD + row * (BASE_CELL_PX + CELL_GAP)) * view.scale;
    const right = left + BASE_CELL_PX * view.scale;
    const bottomY = topY + BASE_CELL_PX * view.scale;
    const topLimit = top.offsetHeight + focusGutter;
    const bottomLimit = boardVp.clientHeight - bottom.offsetHeight - focusGutter;
    let dx = 0;
    let dy = 0;
    if (left < focusGutter) dx = focusGutter - left;
    else if (right > boardVp.clientWidth - focusGutter) {
      dx = boardVp.clientWidth - focusGutter - right;
    }
    if (topY < topLimit) dy = topLimit - topY;
    else if (bottomY > bottomLimit) dy = bottomLimit - bottomY;
    view = clampView({ ...view, tx: view.tx + dx, ty: view.ty + dy }, metrics());
    applyView();
  }

  const gestures = createGestures();
  let longTimer: ReturnType<typeof setTimeout> | null = null;
  const capturedPointerIds = new Set<number>();

  function capturePointer(pointerId: number): void {
    try {
      boardVp.setPointerCapture?.(pointerId);
      if (!boardVp.hasPointerCapture?.(pointerId)) return;
      capturedPointerIds.add(pointerId);
    } catch {
      capturedPointerIds.delete(pointerId);
    }
  }

  function releaseCapturedPointer(pointerId: number): void {
    try {
      if (boardVp.hasPointerCapture?.(pointerId)) boardVp.releasePointerCapture?.(pointerId);
    } catch {
      // 浏览器已隐式释放时只需清理本地集合。
    } finally {
      capturedPointerIds.delete(pointerId);
    }
  }

  function rebuildForOrientation(): boolean {
    const nextWide = window.innerWidth > window.innerHeight;
    const next = createBoardLayout(level.width, level.height, nextWide);
    if (next.wide === layout.wide) return false;

    if (longTimer !== null) clearTimeout(longTimer);
    longTimer = null;
    gestures.reset();
    downCellLogical = null;
    for (const pointerId of [...capturedPointerIds]) releaseCapturedPointer(pointerId);

    const oldCellPx = BASE_CELL_PX * view.scale;
    const centerVisual = hitCell(boardVp.clientWidth / 2, boardVp.clientHeight / 2,
      view, layout.cols, layout.rows);
    const centerLogical = centerVisual === null ? activeLogical : toLogicalIndex(centerVisual, layout);

    layout = next;
    w = layout.cols;
    h = layout.rows;
    updateBoardMetrics();
    renderGridRows();
    syncAll();

    const nextMetrics = metrics();
    view.scale = Math.min(maxScale(nextMetrics), Math.max(fitScale(nextMetrics),
      oldCellPx / BASE_CELL_PX));
    const newVisual = toVisualIndex(centerLogical, layout);
    const boardX = BOARD_PAD + (newVisual % layout.cols) * (BASE_CELL_PX + CELL_GAP) + BASE_CELL_PX / 2;
    const boardY = BOARD_PAD + Math.floor(newVisual / layout.cols) *
      (BASE_CELL_PX + CELL_GAP) + BASE_CELL_PX / 2;
    view = centerBoardPoint(view, nextMetrics, boardX, boardY,
      boardVp.clientWidth / 2, boardVp.clientHeight / 2);
    ensureLogicalVisible(activeLogical);
    cells[activeLogical]!.focus();
    return true;
  }

  function onResize(): void {
    if (!game.isConnected) {
      window.removeEventListener("resize", onResize);
      return;
    }
    if (!rebuildForOrientation()) resizeWithoutTranspose();
  }

  boardVp.addEventListener("contextmenu", (event) => event.preventDefault());

  function vpPoint(event: MouseEvent): { x: number; y: number } {
    const rect = boardVp.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pid(event: Event): number {
    return (event as PointerEvent).pointerId ?? 0;
  }

  function isTouch(event: Event): boolean {
    return (event as PointerEvent).pointerType !== "mouse";
  }

  function run(actions: GestureAction[]): void {
    for (const action of actions) {
      switch (action.type) {
        case "pan": {
          userAdjusted = true;
          view = clampView({ scale: view.scale, tx: view.tx + action.dx, ty: view.ty + action.dy }, metrics());
          applyView();
          break;
        }
        case "pinch": {
          userAdjusted = true;
          const m = metrics();
          view = zoomAt(view, m, action.cx, action.cy, action.factor);
          view = clampView({ scale: view.scale, tx: view.tx + action.dx, ty: view.ty + action.dy }, m);
          applyView();
          break;
        }
        case "tap": {
          if (downCellLogical === null || finished) break;
          const nextAction: Mode = action.touch
            ? action.alt
              ? mode === "dig" ? "flag" : "dig"
              : mode
            : action.alt ? "flag" : "dig";
          if (action.touch && action.alt) navigator.vibrate?.(10);
          act(downCellLogical, nextAction);
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

  boardVp.addEventListener("pointerdown", (event) => {
    unlock();
    const p = vpPoint(event);
    const visual = hitCell(p.x, p.y, view, w, h);
    downCellLogical = visual === null ? null : toLogicalIndex(visual, layout);
    const pointerId = pid(event);
    capturePointer(pointerId);
    run(gestures.handle({
      type: "down", id: pointerId, x: p.x, y: p.y,
      touch: isTouch(event), button: event.button,
    }));
  });

  boardVp.addEventListener("pointermove", (event) => {
    const p = vpPoint(event);
    run(gestures.handle({ type: "move", id: pid(event), x: p.x, y: p.y }));
  });

  boardVp.addEventListener("pointerup", (event) => {
    const p = vpPoint(event);
    const pointerId = pid(event);
    run(gestures.handle({ type: "up", id: pointerId, x: p.x, y: p.y }));
    releaseCapturedPointer(pointerId);
  });

  boardVp.addEventListener("pointercancel", (event) => {
    const pointerId = pid(event);
    run(gestures.handle({ type: "cancel", id: pointerId }));
    releaseCapturedPointer(pointerId);
  });

  boardVp.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      downCellLogical = null;
      userAdjusted = true;
      const p = vpPoint(event);
      view = zoomAt(view, metrics(), p.x, p.y, event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
      applyView();
    },
    { passive: false },
  );

  boardEl.addEventListener("keydown", (event) => {
    const cell = (event.target as Element | null)?.closest<HTMLButtonElement>("[role=gridcell]");
    if (!cell) return;
    const logical = Number(cell.dataset["logicalIndex"]);
    const visual = toVisualIndex(logical, layout);
    const targetVisual = gridKeyTarget(visual, event.key, event.ctrlKey, layout.cols, layout.rows);
    if (targetVisual !== null) {
      event.preventDefault();
      setActiveLogical(toLogicalIndex(targetVisual, layout), true);
      ensureLogicalVisible(activeLogical);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      act(logical, "dig");
      return;
    }
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      act(logical, "flag");
    }
  });

  function setActiveLogical(logical: number, moveFocus: boolean): void {
    activeLogical = logical;
    cells.forEach((item, index) => { item.tabIndex = index === activeLogical ? 0 : -1; });
    if (moveFocus) cells[activeLogical]!.focus();
  }

  function markActionTarget(logical: number): void {
    setActiveLogical(logical, false);
    for (const item of cells) item.removeAttribute("data-result-focus");
    cells[logical]!.dataset["resultFocus"] = "true";
  }

  function act(logical: number, action: Mode): void {
    if (finished) return;
    markActionTarget(logical);
    if (board === null) {
      if (action === "flag") {
        if (preFlags.has(logical)) {
          preFlags.delete(logical);
          playUnflag();
        } else {
          preFlags.add(logical);
          playFlag();
        }
        syncCell(logical);
        restartFiniteAnimation(cells[logical]!, "cell-tap", "cell-tap");
        updateStats();
        return;
      }
      if (preFlags.has(logical)) return;
      board = generate(level, logical, mulberry32((Math.random() * 2 ** 32) >>> 0));
      for (const flagged of preFlags) toggleFlag(board, flagged);
      preFlags.clear();
      startTimer();
    }
    const currentBoard = board;
    if (!currentBoard.revealed[logical] && action === "flag") {
      if (toggleFlag(currentBoard, logical)) playFlag();
      else playUnflag();
      syncCell(logical);
      restartFiniteAnimation(cells[logical]!, "cell-tap", "cell-tap");
      updateStats();
      return;
    }

    const wasOpen = currentBoard.revealed[logical];
    const result = wasOpen ? chord(currentBoard, logical) : reveal(currentBoard, logical);
    if (result.changed.length > 0 && !result.exploded) {
      if (!wasOpen && currentBoard.adjacent[logical] === 0) playBlank();
      else playNumber();
    }
    if (result.changed.length > 0) syncChanged(result.changed, logical);
    updateStats();
    if (result.exploded) {
      let boomLogical: number | null = currentBoard.mine[logical] ? logical : null;
      for (const changedLogical of result.changed) {
        if (currentBoard.mine[changedLogical] &&
          (boomLogical === null || changedLogical < boomLogical)) {
          boomLogical = changedLogical;
        }
      }
      return lose("mine", boomLogical);
    }
    if (isWin(currentBoard)) return win();
  }

  function setMode(nextMode: Mode): void {
    mode = nextMode;
    digBtn.classList.toggle("active", nextMode === "dig");
    flagBtn.classList.toggle("active", nextMode === "flag");
    digBtn.setAttribute("aria-pressed", String(nextMode === "dig"));
    flagBtn.setAttribute("aria-pressed", String(nextMode === "flag"));
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

  function win(): void {
    finished = true;
    stopTimer();
    window.removeEventListener("resize", onResize);
    playWin();
    const currentBoard = board!;
    const autoFlagged: number[] = [];
    for (let logical = 0; logical < size; logical++) {
      if (currentBoard.mine[logical] && !currentBoard.flagged[logical]) {
        toggleFlag(currentBoard, logical);
        autoFlagged.push(logical);
      }
    }
    for (const logical of autoFlagged) syncCell(logical);
    updateStats();
    pendingFinish = { won: true, timeSec: elapsedSec() };
    finishTimer = setTimeout(() => {
      const pending = pendingFinish!;
      finishTimer = null;
      pendingFinish = null;
      deps.onFinish(pending);
    }, FINISH_PAUSE_MS);
  }

  function lose(reason: "mine" | "time", boomLogical: number | null): void {
    if (finished) return;
    finished = true;
    stopTimer();
    window.removeEventListener("resize", onResize);
    if (reason === "mine") playBoom();
    const currentBoard = board;
    if (currentBoard) {
      for (let logical = 0; logical < size; logical++) {
        const cell = cells[logical]!;
        if (currentBoard.mine[logical] && !currentBoard.flagged[logical]) {
          cell.classList.add("open", "mine-shown");
          cell.textContent = "💣";
        } else if (!currentBoard.mine[logical] && currentBoard.flagged[logical]) {
          cell.classList.add("wrong");
          cell.textContent = "✕";
        }
      }
      if (boomLogical !== null) {
        const cell = cells[boomLogical]!;
        cell.classList.add("boom");
        cell.textContent = "💥";
      }
      for (let logical = 0; logical < size; logical++) syncCellA11y(logical);
    }
    pendingFinish = { won: false, reason, timeSec: startedAt === 0 ? 0 : elapsedSec() };
    finishTimer = setTimeout(() => {
      const pending = pendingFinish!;
      finishTimer = null;
      pendingFinish = null;
      playLose();
      deps.onFinish(pending);
    }, FINISH_PAUSE_MS);
  }

  function settleFinish(): void {
    if (finishTimer !== null) {
      clearTimeout(finishTimer);
      finishTimer = null;
    }
    const pending = pendingFinish;
    pendingFinish = null;
    if (pending !== null && pending.won) deps.onFinish(pending);
  }

  function exit(): void {
    stopTimer();
    finished = true;
    window.removeEventListener("resize", onResize);
    settleFinish();
    deps.onExit();
  }

  function restart(): void {
    finished = true;
    stopTimer();
    window.removeEventListener("resize", onResize);
    settleFinish();
    showGame(root, deps);
  }

  function syncChanged(changedLogical: number[], originLogical: number): void {
    for (const logical of changedLogical) syncCell(logical);
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const viewportRect = boardVp.getBoundingClientRect();
    const selected = selectCascadeCells(
      changedLogical,
      originLogical,
      level.width,
      (logical) => {
        const rect = cells[logical]!.getBoundingClientRect();
        return rect.right > viewportRect.left && rect.left < viewportRect.right &&
          rect.bottom > viewportRect.top && rect.top < viewportRect.bottom;
      },
      64,
    );
    restartFiniteAnimations(
      selected.map((logical) => cells[logical]!),
      boardEl,
      "cell-pop",
      "cell-pop",
    );
  }

  function syncAll(): void {
    for (let logical = 0; logical < size; logical++) syncCell(logical);
  }

  function syncCell(logical: number): void {
    const cell = cells[logical]!;
    if (board === null) {
      if (preFlags.has(logical)) {
        cell.className = "cell flagged";
        cell.textContent = "🚩";
      } else {
        cell.className = "cell";
        cell.textContent = "";
      }
      syncCellA11y(logical);
      return;
    }
    const currentBoard = board;
    if (currentBoard.revealed[logical] && !currentBoard.mine[logical]) {
      const adjacent = currentBoard.adjacent[logical];
      cell.className = `cell open${adjacent > 0 ? ` n${adjacent}` : ""}`;
      cell.textContent = adjacent > 0 ? String(adjacent) : "";
    } else if (currentBoard.flagged[logical]) {
      cell.className = "cell flagged";
      cell.textContent = "🚩";
    } else {
      cell.className = "cell";
      cell.textContent = "";
    }
    syncCellA11y(logical);
  }

  function syncCellA11y(logical: number): void {
    const cell = cells[logical]!;
    const visual = toVisualIndex(logical, layout);
    const row = Math.floor(visual / layout.cols) + 1;
    const col = (visual % layout.cols) + 1;
    let state: CellA11yState;
    if (cell.classList.contains("boom")) state = { kind: "exploded" };
    else if (cell.classList.contains("wrong")) state = { kind: "wrong-flag" };
    else if (cell.classList.contains("mine-shown")) state = { kind: "mine" };
    else if (cell.classList.contains("flagged")) state = { kind: "flagged" };
    else if (board?.revealed[logical]) state = { kind: "open", adjacent: board.adjacent[logical]! };
    else if (finished && board !== null && !board.mine[logical]) state = { kind: "safe-hidden" };
    else state = { kind: "hidden" };
    cell.setAttribute("aria-label", cellAriaLabel(row, col, state));
  }

  setMode(mode);
  syncSoundBtn();
  const needsOperable = fitScale(metrics()) * BASE_CELL_PX < OPERABLE_CELL_PX;
  viewMode = needsOperable ? "operable" : "fit";
  if (needsOperable && !uiPrefs.load().largeBoardHintSeen) {
    const gestureHint = document.createElement("p");
    gestureHint.className = "board-gesture-hint";
    gestureHint.setAttribute("role", "status");
    gestureHint.textContent = "单指拖动棋盘，双指缩放棋盘";
    bottom.prepend(gestureHint);
    uiPrefs.setLargeBoardHintSeen(true);
  }
  setViewMode(viewMode);
  requestAnimationFrame(() => setViewMode(viewMode));
  cells[activeLogical]!.focus();
  window.addEventListener("resize", onResize);

  function button(cls: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cls;
    btn.dataset["jelly"] = "";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }
}

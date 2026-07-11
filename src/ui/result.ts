import { fmtTime } from "./format";
import { cycleDialogFocus } from "./focus";

let currentCleanup: ((restore: boolean) => void) | null = null;

export interface ResultOptions {
  won: boolean;
  reason?: "mine" | "time";
  timeSec: number;
  newBest: boolean;
  persisted: boolean;
  hasNext: boolean;
  backgroundRoot: HTMLElement;
  restoreFocus?: HTMLElement | null;
  /** 无尽模式:胜=新连胜数,负=止步时的连胜数;存在即启用无尽文案 */
  endless?: { streak: number };
  onNext(): void;
  onRetry(): void;
  onMenu(): void;
}

export function showResult(opts: ResultOptions): void {
  currentCleanup?.(false);

  const overlay = document.createElement("div");
  overlay.className = "overlay";

  const modal = document.createElement("div");
  modal.className = "modal glass-clear";
  modal.dataset["liquidGlass"] = "";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  const icon = opts.won ? (opts.endless ? "🔥" : "🎉") : opts.reason === "time" ? "⏰" : "💥";
  const heading = opts.endless
    ? opts.won
      ? `连胜 ${opts.endless.streak}!`
      : `连胜止于 ${opts.endless.streak}`
    : opts.won
      ? "通关！"
      : opts.reason === "time"
        ? "时间到"
        : "踩到雷了";

  const iconEl = document.createElement("div");
  iconEl.className = "modal-icon";
  iconEl.textContent = icon;
  iconEl.setAttribute("aria-hidden", "true");
  const h = document.createElement("h2");
  h.id = "result-title";
  h.textContent = heading;
  modal.append(iconEl, h);

  const summary = document.createElement("div");
  summary.id = "result-summary";
  modal.setAttribute("aria-labelledby", h.id);
  modal.setAttribute("aria-describedby", summary.id);
  const reason = document.createElement("p");
  reason.className = "result-reason";
  reason.textContent = heading;
  const time = document.createElement("p");
  time.className = "modal-time num";
  time.textContent = `用时 ${fmtTime(opts.timeSec)}`;
  summary.append(reason, time);

  if (opts.newBest) {
    const badge = document.createElement("span");
    badge.className = "best-badge";
    badge.textContent = opts.endless ? "★ 新纪录 · 最长连胜" : "★ 新纪录";
    summary.appendChild(badge);
  }

  if (!opts.persisted) {
    const warn = document.createElement("p");
    warn.className = "save-warn";
    warn.textContent = "进度暂未保存，将自动重试";
    summary.appendChild(warn);
  }
  modal.appendChild(summary);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  let cleaned = false;
  let onDocumentKeydown: ((event: KeyboardEvent) => void) | null = null;
  const cleanup = (restore: boolean): void => {
    if (cleaned) return;
    cleaned = true;
    if (onDocumentKeydown) {
      document.removeEventListener("keydown", onDocumentKeydown);
      onDocumentKeydown = null;
    }
    overlay.remove();
    opts.backgroundRoot.inert = false;
    if (currentCleanup === cleanup) currentCleanup = null;
    if (!restore) return;
    const preferred = opts.restoreFocus?.isConnected
      && opts.backgroundRoot.contains(opts.restoreFocus) ? opts.restoreFocus : null;
    const gridCells = [...opts.backgroundRoot.querySelectorAll<HTMLElement>("[role=gridcell]")];
    const lastLogical = gridCells.reduce<HTMLElement | null>((last, cell) => {
      if (last === null) return cell;
      return Number(cell.dataset["logicalIndex"]) > Number(last.dataset["logicalIndex"])
        ? cell : last;
    }, null);
    const title = opts.backgroundRoot.querySelector<HTMLElement>(".game-title");
    (preferred ?? lastLogical ?? title)?.focus();
  };
  currentCleanup = cleanup;
  const close = (fn: () => void) => () => {
    if (cleaned) return;
    cleanup(false);
    fn();
  };
  if (opts.won) {
    if (opts.endless) {
      actions.appendChild(btn("btn primary win", "下一盘", close(opts.onNext)));
    } else {
      if (opts.hasNext) actions.appendChild(btn("btn primary win", "下一关", close(opts.onNext)));
      actions.appendChild(btn(opts.hasNext ? "btn" : "btn primary win", "重玩", close(opts.onRetry)));
    }
  } else {
    actions.appendChild(btn("btn primary lose", opts.endless ? "再来一盘" : "重试", close(opts.onRetry)));
  }
  actions.appendChild(btn("btn", opts.endless ? "回首页" : "返回选关", close(opts.onMenu)));
  modal.appendChild(actions);

  onDocumentKeydown = (event) => {
    cycleDialogFocus(event, modal);
    if (event.key !== "Escape") return;
    event.preventDefault();
    cleanup(true);
  };
  document.addEventListener("keydown", onDocumentKeydown);

  overlay.appendChild(modal);
  opts.backgroundRoot.inert = true;
  document.body.appendChild(overlay);
  (actions.querySelector("button") as HTMLButtonElement | null)?.focus();
}

function btn(cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.dataset["jelly"] = "";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

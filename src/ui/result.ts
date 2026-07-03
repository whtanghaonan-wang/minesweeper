import { fmtTime } from "./format";

export interface ResultOptions {
  won: boolean;
  reason?: "mine" | "time";
  timeSec: number;
  newBest: boolean;
  persisted: boolean;
  hasNext: boolean;
  onNext(): void;
  onRetry(): void;
  onMenu(): void;
}

export function showResult(opts: ResultOptions): void {
  const overlay = document.createElement("div");
  overlay.className = "overlay";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  const icon = opts.won ? "🎉" : opts.reason === "time" ? "⏰" : "💥";
  const heading = opts.won ? "通关！" : opts.reason === "time" ? "时间到" : "踩到雷了";

  const iconEl = document.createElement("div");
  iconEl.className = "modal-icon";
  iconEl.textContent = icon;
  const h = document.createElement("h2");
  h.textContent = heading;
  modal.append(iconEl, h);

  if (opts.won || opts.timeSec > 0) {
    const time = document.createElement("p");
    time.className = "modal-time num";
    time.textContent = `用时 ${fmtTime(opts.timeSec)}`;
    modal.appendChild(time);
  }

  if (opts.won && opts.newBest) {
    const badge = document.createElement("span");
    badge.className = "best-badge";
    badge.textContent = "★ 新纪录";
    modal.appendChild(badge);
  }

  if (opts.won && !opts.persisted) {
    const warn = document.createElement("p");
    warn.className = "save-warn";
    warn.textContent = "本次成绩未能保存";
    modal.appendChild(warn);
  }

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const close = (fn: () => void) => () => {
    overlay.remove();
    fn();
  };
  if (opts.won) {
    if (opts.hasNext) actions.appendChild(btn("btn primary win", "下一关", close(opts.onNext)));
    actions.appendChild(btn(opts.hasNext ? "btn" : "btn primary win", "重玩", close(opts.onRetry)));
  } else {
    actions.appendChild(btn("btn primary lose", "重试", close(opts.onRetry)));
  }
  actions.appendChild(btn("btn", "返回选关", close(opts.onMenu)));
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  (actions.querySelector("button") as HTMLButtonElement | null)?.focus();
}

function btn(cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

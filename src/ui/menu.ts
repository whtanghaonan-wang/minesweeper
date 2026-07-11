import { LEVELS, type LevelSpec } from "../core/levels";
import type { GameStorage } from "../core/storage";
import { fmtTime } from "./format";
import { vineLayout, type VineLayout, type VineNode } from "./vine";

export interface MenuDeps {
  storage: GameStorage;
  /** 存档降级为内存态时为 true，用于提示成绩不会保存 */
  persistWarning?: boolean;
  onPlay(level: LevelSpec): void;
  onBack(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function showMenu(root: HTMLElement, deps: MenuDeps): void {
  const save = deps.storage.load();

  const menu = document.createElement("div");
  menu.className = "menu";

  const head = document.createElement("header");
  head.className = "menu-head";
  head.innerHTML = `<h1>扫雷</h1><p class="menu-sub">无猜 · 五十关 · 十档</p>`;

  const back = document.createElement("button");
  back.type = "button";
  back.className = "pill back menu-back";
  back.textContent = "←";
  back.setAttribute("aria-label", "返回首页");
  back.addEventListener("click", () => deps.onBack());
  menu.appendChild(back);

  menu.appendChild(head);

  if (deps.persistWarning) {
    const note = document.createElement("p");
    note.className = "menu-note";
    note.textContent = "当前无法读写本地存储，成绩与进度只在本次游戏内有效";
    menu.appendChild(note);
  }

  const layout = vineLayout(LEVELS);
  const map = document.createElement("div");
  map.className = "vine-map";
  map.appendChild(buildSvg(layout));

  let currentEl: HTMLButtonElement | null = null;
  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i]!;
    const btn = vineNode(level, layout.nodes[i]!, layout, save.unlockedLevel, save.bestTimes[level.id], deps);
    if (btn.classList.contains("current")) currentEl = btn;
    map.appendChild(btn);
  }

  const playable = [...map.querySelectorAll<HTMLButtonElement>(".vine-node:not(:disabled)")];
  let activeIndex = currentEl === null
    ? playable.length - 1
    : Math.max(0, playable.indexOf(currentEl));
  const syncTabStops = (): void => {
    playable.forEach((node, index) => {
      node.tabIndex = index === activeIndex ? 0 : -1;
    });
  };
  const focusAt = (index: number): void => {
    activeIndex = Math.max(0, Math.min(playable.length - 1, index));
    syncTabStops();
    playable[activeIndex]?.focus();
    playable[activeIndex]?.scrollIntoView?.({ block: "center" });
  };
  syncTabStops();
  map.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches(".vine-node")) return;
    const index = playable.indexOf(event.target);
    const next = event.key === "ArrowUp" || event.key === "ArrowLeft" ? index - 1
      : event.key === "ArrowDown" || event.key === "ArrowRight" ? index + 1
        : event.key === "Home" ? 0
          : event.key === "End" ? playable.length - 1
            : null;
    if (next === null) return;
    event.preventDefault();
    focusAt(next);
  });

  menu.appendChild(map);
  root.replaceChildren(menu);
  focusAt(activeIndex);
}

function buildSvg(layout: VineLayout): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  svg.classList.add("vine-svg");

  const pts = (points: { x: number; y: number }[]): string =>
    points.map((p) => `${p.x},${p.y}`).join(" ");

  const base = document.createElementNS(SVG_NS, "polyline");
  base.setAttribute("points", pts(layout.nodes));
  base.classList.add("vine-base");
  svg.appendChild(base);

  for (const seg of layout.segments) {
    const pl = document.createElementNS(SVG_NS, "polyline");
    pl.setAttribute("points", pts(seg.points));
    pl.classList.add("vine-band", `tier-${seg.tier}`);
    svg.appendChild(pl);
  }

  const deco = (x: number, y: number, glyph: string): void => {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("font-size", "16");
    t.textContent = glyph;
    svg.appendChild(t);
  };
  const rootNode = layout.nodes[0]!;
  const topNode = layout.nodes[layout.nodes.length - 1]!;
  deco(rootNode.x - 30, rootNode.y + 26, "🌱");
  deco(topNode.x + 16, topNode.y - 20, "👑");
  return svg;
}

function vineNode(
  level: LevelSpec,
  pos: VineNode,
  layout: VineLayout,
  unlockedLevel: number,
  best: number | undefined,
  deps: MenuDeps,
): HTMLButtonElement {
  const locked = level.id > unlockedLevel;
  const done = best !== undefined || level.id < unlockedLevel;
  const current = !locked && !done;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `vine-node tier-${level.tier}`;
  if (locked) btn.classList.add("locked");
  if (done) btn.classList.add("done");
  if (current) btn.classList.add("current");
  btn.style.left = `${(pos.x / layout.width) * 100}%`;
  btn.style.top = `${(pos.y / layout.height) * 100}%`;

  const num = document.createElement("span");
  num.className = "vn-num num";
  num.textContent = String(level.id);
  const sub = document.createElement("span");
  sub.className = "vn-best num";
  sub.textContent = locked ? "🔒" : best !== undefined ? fmtTime(best) : done ? "—" : "未通关";
  btn.append(num, sub);

  if (locked) {
    btn.disabled = true;
    btn.setAttribute("aria-label", `第 ${level.id} 关（未解锁）`);
  } else {
    btn.setAttribute(
      "aria-label",
      `第 ${level.id} 关，${best !== undefined ? `最好成绩 ${fmtTime(best)}` : done ? "已通关" : "未通关"}`,
    );
    btn.addEventListener("click", () => deps.onPlay(level));
  }
  return btn;
}

import { LEVELS, type LevelSpec } from "../core/levels";
import type { GameStorage } from "../core/storage";
import { setMuted } from "./audio";
import { fmtTime } from "./format";
import { markStandaloneGlass } from "./liquid-glass";
import {
  applyReducedTransparency,
  type UiPrefsStore,
} from "./ui-prefs";

export interface HomeDeps {
  storage: GameStorage;
  uiPrefs: UiPrefsStore;
  version: string;
  onContinue(level: LevelSpec): void;
  onSelect(): void;
  onEndless(): void;
  onPersisted?(persisted: boolean): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX = LEVELS.length;

/** 游戏首界面:藤蔓延伸式(v2.1 设计文档 §4) */
export function showHome(root: HTMLElement, deps: HomeDeps): void {
  const save = deps.storage.load();
  const done = LEVELS.filter(
    (l) => save.bestTimes[l.id] !== undefined || l.id < save.unlockedLevel,
  ).length;
  const bestOwner = [...LEVELS].reverse().find((l) => save.bestTimes[l.id] !== undefined);
  const cleared = save.bestTimes[MAX] !== undefined;
  const fresh = save.unlockedLevel === 1 && save.bestTimes[1] === undefined;
  const target = LEVELS[(cleared ? MAX : save.unlockedLevel) - 1]!;
  const primaryLabel = fresh
    ? "开始游戏 · 第 1 关"
    : cleared
      ? `再战 · 第 ${MAX} 关`
      : `继续 · 第 ${save.unlockedLevel} 关`;

  const home = document.createElement("div");
  home.className = "home";

  const hero = document.createElement("div");
  hero.className = "home-hero";
  hero.appendChild(buildVineDeco());
  const title = document.createElement("h1");
  title.textContent = "扫雷";
  title.tabIndex = -1;
  const sub = document.createElement("p");
  sub.className = "home-sub";
  sub.textContent = "沿着藤蔓,一路向上";
  hero.append(title, sub);

  const panel = document.createElement("section");
  panel.className = "home-panel";

  const stats = document.createElement("div");
  stats.className = "home-stats num";
  const doneStat = document.createElement("span");
  doneStat.textContent = `🌱 已通关 ${done}/${MAX}`;
  const bestStat = document.createElement("span");
  bestStat.textContent = `⏱ 最近通关 ${bestOwner ? fmtTime(save.bestTimes[bestOwner.id]!) : "—"}`;
  const soundBtn = document.createElement("button");
  soundBtn.type = "button";
  soundBtn.className = "sound-btn";
  const soundContent = markStandaloneGlass(soundBtn);
  let on = save.soundOn;
  const syncSound = (): void => {
    soundContent.textContent = on ? "🔊" : "🔇";
    soundBtn.setAttribute("aria-label", on ? "关闭音效" : "开启音效");
  };
  syncSound();
  soundBtn.addEventListener("click", () => {
    on = !on;
    setMuted(!on);
    const persisted = deps.storage.setSoundOn(on);
    deps.onPersisted?.(persisted);
    syncSound();
  });
  stats.append(doneStat, bestStat);
  if (save.endless.bestStreak > 0) {
    const streakStat = document.createElement("span");
    streakStat.textContent = `♾ 最长连胜 ${save.endless.bestStreak}`;
    stats.appendChild(streakStat);
  }
  stats.appendChild(soundBtn);
  const transparencyBtn = document.createElement("button");
  transparencyBtn.type = "button";
  transparencyBtn.className = "transparency-btn";
  const transparencyContent = markStandaloneGlass(transparencyBtn);
  let reduced = deps.uiPrefs.load().reducedTransparency;
  const syncTransparency = (): void => {
    transparencyContent.textContent = reduced ? "◼ 实色" : "◫ 玻璃";
    transparencyBtn.setAttribute("aria-label", "降低透明度");
    transparencyBtn.setAttribute("aria-pressed", String(reduced));
    applyReducedTransparency(reduced);
  };
  transparencyBtn.addEventListener("click", () => {
    reduced = !reduced;
    deps.uiPrefs.setReducedTransparency(reduced);
    syncTransparency();
  });
  syncTransparency();
  stats.appendChild(transparencyBtn);

  const barWrap = document.createElement("div");
  barWrap.className = "home-bar";
  const fill = document.createElement("div");
  fill.className = "home-bar-fill";
  fill.style.width = `${(done / MAX) * 100}%`;
  barWrap.appendChild(fill);

  const actions = document.createElement("div");
  actions.className = "home-actions";
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "home-play";
  const playContent = markStandaloneGlass(playBtn, true);
  playContent.textContent = `▶ ${primaryLabel}`;
  playBtn.addEventListener("click", () => deps.onContinue(target));
  const selBtn = document.createElement("button");
  selBtn.type = "button";
  selBtn.className = "home-select";
  selBtn.textContent = "🌿 选关";
  markStandaloneGlass(selBtn);
  selBtn.addEventListener("click", () => deps.onSelect());
  const endlessBtn = document.createElement("button");
  endlessBtn.type = "button";
  endlessBtn.className = "home-endless";
  if (cleared) {
    endlessBtn.textContent = "♾ 无尽";
    endlessBtn.addEventListener("click", () => deps.onEndless());
  } else {
    endlessBtn.disabled = true;
    endlessBtn.classList.add("locked");
    endlessBtn.innerHTML = `♾ 无尽<span class="he-sub">🔒 通关 50 关解锁</span>`;
  }
  markStandaloneGlass(endlessBtn);
  actions.append(playBtn, selBtn, endlessBtn);

  const ver = document.createElement("p");
  ver.className = "home-ver num";
  ver.textContent = `v${deps.version}`;

  panel.append(stats, barWrap, actions, ver);
  home.append(hero, panel);
  root.replaceChildren(home);
  title.focus();
}

/** 装饰藤蔓:自顶垂落,CSS 驱动生长动画(prefers-reduced-motion 时静态) */
function buildVineDeco(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 260 330");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("home-vine");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M 130 -10 C 70 60, 190 100, 130 170 C 80 230, 170 260, 140 330");
  path.setAttribute("pathLength", "1");
  svg.appendChild(path);
  const dot = (x: number, y: number, r: number, cls: string): void => {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(y));
    c.setAttribute("r", String(r));
    c.classList.add(cls);
    svg.appendChild(c);
  };
  dot(105, 62, 7, "home-leaf");
  dot(163, 108, 7, "home-leaf");
  dot(130, 170, 10, "home-bud");
  dot(122, 258, 8, "home-leaf");
  return svg;
}

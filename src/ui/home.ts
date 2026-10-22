import { LEVELS, type LevelSpec } from "../core/levels";
import type { GameStorage } from "../core/storage";
import { setMuted } from "./audio";
import { fmtTime } from "./format";
import { icon, iconLabel } from "./icons";
import { applyReducedTransparency, type UiPrefsStore } from "./ui-prefs";

export interface HomeDeps {
  storage: GameStorage;
  uiPrefs: UiPrefsStore;
  version: string;
  onContinue(level: LevelSpec): void;
  onSelect(): void;
  onEndless(): void;
  onPersisted?(persisted: boolean): void;
}
export interface HomeViewController {
  cancelAll(): void;
  destroy(): void;
}
const MAX = LEVELS.length;

export function showHome(root: HTMLElement, deps: HomeDeps): HomeViewController {
  const events = new AbortController();
  const save = deps.storage.load();
  const done = LEVELS.filter(l => save.bestTimes[l.id] !== undefined || l.id < save.unlockedLevel).length;
  const bestOwner = [...LEVELS].reverse().find(l => save.bestTimes[l.id] !== undefined);
  const cleared = save.bestTimes[MAX] !== undefined;
  const fresh = save.unlockedLevel === 1 && save.bestTimes[1] === undefined;
  const target = LEVELS[(cleared ? MAX : save.unlockedLevel) - 1]!;
  const primaryLabel = fresh ? "开始游戏 · 第 1 关"
    : cleared ? `再战 · 第 ${MAX} 关` : `继续 · 第 ${save.unlockedLevel} 关`;

  const home = document.createElement("div");
  home.className = "home";
  const tools = document.createElement("div");
  tools.className = "home-tools";
  tools.setAttribute("role", "group");
  tools.setAttribute("aria-label", "游戏偏好");
  let soundOn = save.soundOn;
  const soundBtn = makeButton("sound-btn", () => {
    soundOn = !soundOn;
    setMuted(!soundOn);
    const persisted = deps.storage.setSoundOn(soundOn);
    deps.onPersisted?.(persisted);
    syncSound();
  });
  const syncSound = (): void => {
    soundBtn.replaceChildren(icon(soundOn ? "sound" : "muted"));
    soundBtn.setAttribute("aria-label", soundOn ? "关闭音效" : "开启音效");
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    soundBtn.title = soundOn ? "关闭音效" : "开启音效";
  };
  syncSound();
  let reduced = deps.uiPrefs.load().reducedTransparency;
  const appearanceBtn = makeButton("transparency-btn", () => {
    reduced = !reduced;
    deps.uiPrefs.setReducedTransparency(reduced);
    syncAppearance();
  });
  appearanceBtn.append(icon("palette"));
  const syncAppearance = (): void => {
    appearanceBtn.setAttribute("aria-label", "降低透明度");
    appearanceBtn.setAttribute("aria-pressed", String(reduced));
    appearanceBtn.title = reduced ? "当前为实色，切换为玻璃" : "当前为玻璃，切换为实色";
    applyReducedTransparency(reduced);
  };
  syncAppearance();
  tools.append(soundBtn, appearanceBtn);

  const hero = document.createElement("div");
  hero.className = "home-hero";
  const vine = document.createElement("img");
  vine.className = "home-vine";
  vine.src = `${import.meta.env.BASE_URL}art/home-vine.png`;
  vine.alt = "";
  vine.setAttribute("aria-hidden", "true");
  vine.draggable = false;
  const title = document.createElement("h1");
  title.textContent = "扫雷";
  title.tabIndex = -1;
  const sub = document.createElement("p");
  sub.className = "home-sub";
  sub.textContent = "沿着藤蔓，一路向上";
  const heading = document.createElement("div");
  heading.className = "home-heading";
  heading.append(title, sub);
  hero.append(vine, heading);

  const panel = document.createElement("section");
  panel.className = "home-panel glass-clear glass-calm";
  panel.dataset["liquidGlass"] = "";
  panel.setAttribute("aria-label", "开始与选择游戏");
  const stats = document.createElement("div");
  stats.className = "home-stats num";
  const doneStat = document.createElement("span");
  iconLabel(doneStat, "sprout", `已通关 ${done}/${MAX}`);
  const bestStat = document.createElement("span");
  iconLabel(bestStat, "timer", `最近通关 ${bestOwner ? fmtTime(save.bestTimes[bestOwner.id]!) : "—"}`);
  stats.append(doneStat, bestStat);
  if (save.endless.bestStreak > 0) {
    const streak = document.createElement("span");
    streak.className = "home-streak";
    iconLabel(streak, "endless", `最长连胜 ${save.endless.bestStreak}`);
    stats.append(streak);
  }
  const progress = document.createElement("div");
  progress.className = "home-bar";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "通关进度");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", String(MAX));
  progress.setAttribute("aria-valuenow", String(done));
  const fill = document.createElement("div");
  fill.className = "home-bar-fill";
  fill.style.width = `${done / MAX * 100}%`;
  progress.append(fill);
  const playBtn = makeButton("home-play", () => deps.onContinue(target));
  iconLabel(playBtn, "play", primaryLabel);
  const selectBtn = makeButton("home-select", deps.onSelect);
  iconLabel(selectBtn, "leaf", "选关");
  const endlessBtn = makeButton("home-endless", deps.onEndless);
  const endlessLabel = document.createElement("span");
  endlessLabel.className = "he-label";
  iconLabel(endlessLabel, "endless", "无尽");
  endlessBtn.append(endlessLabel);
  if (!cleared) {
    endlessBtn.disabled = true;
    endlessBtn.classList.add("locked");
    const hint = document.createElement("span");
    hint.className = "he-sub";
    iconLabel(hint, "lock", "通关 50 关解锁");
    endlessBtn.append(hint);
  }
  const secondary = document.createElement("div");
  secondary.className = "home-secondary-actions";
  secondary.append(selectBtn, endlessBtn);
  const version = document.createElement("p");
  version.className = "home-ver num";
  version.textContent = `v${deps.version}`;
  panel.append(stats, progress, playBtn, secondary);
  home.append(tools, hero, panel, version);
  root.replaceChildren(home);
  title.focus();
  return {
    // Home actions are immediate; no delayed navigation remains to cancel.
    cancelAll: () => {},
    destroy: () => events.abort(),
  };

  function makeButton(className: string, activate: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset["jelly"] = "";
    button.addEventListener("click", activate, { signal: events.signal });
    return button;
  }
}

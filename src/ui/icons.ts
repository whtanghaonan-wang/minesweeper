import {
  ArrowLeft, Bomb, Check, ChevronLeft, Crown, Flag, Infinity as InfinityIcon,
  Leaf, LockKeyhole, Maximize, Palette, Play, RotateCcw, Shovel, Sprout,
  Timer, Volume2, VolumeX, X, ZoomIn, createElement, type IconNode,
} from "lucide";

const icons = {
  back: ChevronLeft, arrowLeft: ArrowLeft, mine: Bomb, flag: Flag,
  endless: InfinityIcon, leaf: Leaf, lock: LockKeyhole, fit: Maximize,
  palette: Palette, play: Play, restart: RotateCcw, dig: Shovel,
  sprout: Sprout, timer: Timer, sound: Volume2, muted: VolumeX,
  zoom: ZoomIn, check: Check, close: X, crown: Crown,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof icons;

/** Decorative library icons; the owning control supplies its accessible name. */
export function icon(name: IconName, className = ""): SVGElement {
  return createElement(icons[name], {
    class: `ui-icon ${className}`.trim(), "aria-hidden": "true",
    focusable: "false", "stroke-width": "1.8", "data-icon": name,
  });
}

export function iconLabel(target: HTMLElement, name: IconName, label: string): void {
  const text = document.createElement("span");
  text.textContent = label;
  target.replaceChildren(icon(name), text);
}

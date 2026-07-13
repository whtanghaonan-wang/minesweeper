export type HomeLiquidTargetKind = "instant" | "navigation";

export interface HomeLiquidTarget {
  button: HTMLButtonElement;
  kind: HomeLiquidTargetKind;
  activate(): void;
}

export interface HomeLiquidSelectionController {
  destroy(): void;
}

const NAVIGATION_DELAY_MS = 220;
const CLICK_DURATION_MS = 580;
const TARGET_PADDING_PX = 5;
const MIN_TARGET_PX = 48;
const PANEL_SAFETY_PX = 6;
const BASE_TRANSFORM = "translate(-50%, -50%)";

interface TargetGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MeasuredTarget {
  geometry: TargetGeometry;
  layoutAvailable: boolean;
}

function clampCenter(value: number, size: number, panelSize: number): number {
  const minimum = PANEL_SAFETY_PX + size / 2;
  const maximum = panelSize - PANEL_SAFETY_PX - size / 2;
  if (maximum < minimum) return panelSize / 2;
  return Math.max(minimum, Math.min(maximum, value));
}

function px(value: number): string {
  return `${Math.round(value * 1000) / 1000}px`;
}

function measureTarget(
  panel: HTMLElement,
  button: HTMLButtonElement,
): MeasuredTarget | null {
  try {
    const panelRect = panel.getBoundingClientRect();
    const targetRect = button.getBoundingClientRect();
    const values = [
      panelRect.left,
      panelRect.top,
      panelRect.width,
      panelRect.height,
      targetRect.left,
      targetRect.top,
      targetRect.width,
      targetRect.height,
    ];
    if (!values.every(Number.isFinite)) return null;

    const width = Math.max(MIN_TARGET_PX, targetRect.width + TARGET_PADDING_PX * 2);
    const height = Math.max(MIN_TARGET_PX, targetRect.height + TARGET_PADDING_PX * 2);
    const targetCenterX = targetRect.left + targetRect.width / 2 - panelRect.left;
    const targetCenterY = targetRect.top + targetRect.height / 2 - panelRect.top;

    return {
      geometry: {
        left: clampCenter(targetCenterX, width, panelRect.width),
        top: clampCenter(targetCenterY, height, panelRect.height),
        width,
        height,
      },
      layoutAvailable: panelRect.width > 0
        && panelRect.height > 0
        && targetRect.width > 0
        && targetRect.height > 0,
    };
  } catch {
    return null;
  }
}

function applyGeometry(indicator: HTMLElement, geometry: TargetGeometry): void {
  indicator.style.left = px(geometry.left);
  indicator.style.top = px(geometry.top);
  indicator.style.width = px(geometry.width);
  indicator.style.height = px(geometry.height);
  indicator.style.transform = BASE_TRANSFORM;
}

function frame(
  geometry: TargetGeometry,
  scale: string,
  offset: number,
): Keyframe {
  return {
    left: px(geometry.left),
    top: px(geometry.top),
    width: px(geometry.width),
    height: px(geometry.height),
    transform: `${BASE_TRANSFORM} scale(${scale})`,
    offset,
  };
}

function midpoint(from: TargetGeometry, to: TargetGeometry): TargetGeometry {
  return {
    left: (from.left + to.left) / 2,
    top: (from.top + to.top) / 2,
    width: (from.width + to.width) / 2,
    height: (from.height + to.height) / 2,
  };
}

export function installHomeLiquidSelection(
  panel: HTMLElement,
  indicator: HTMLElement,
  targets: readonly HomeLiquidTarget[],
  initialButton: HTMLButtonElement,
): HomeLiquidSelectionController {
  const initialTarget = targets.find((target) => target.button === initialButton);
  if (!initialTarget) {
    throw new Error("Home liquid selection initial button must be a target");
  }
  if (initialTarget.button.disabled) {
    throw new Error("Home liquid selection initial target cannot be disabled");
  }

  const ownerWindow = panel.ownerDocument.defaultView;
  let selectedTarget = initialTarget;
  let currentGeometry: TargetGeometry | null = null;
  let currentLayoutAvailable = false;
  let pendingActivation: ReturnType<typeof setTimeout> | undefined;
  let activeAnimation: Animation | null = null;
  let destroyed = false;

  const cancelPendingActivation = (): void => {
    if (pendingActivation === undefined) return;
    clearTimeout(pendingActivation);
    pendingActivation = undefined;
  };

  const cancelAnimation = (): void => {
    if (!activeAnimation) return;
    try {
      activeAnimation.cancel();
    } catch {
      // Some partial WAAPI implementations can throw while cancelling.
    }
    activeAnimation = null;
  };

  const moveIndicator = (button: HTMLButtonElement, animate: boolean): void => {
    const measuredTarget = measureTarget(panel, button);
    if (!measuredTarget) return;

    const previousGeometry = currentGeometry;
    const layoutAvailable = currentLayoutAvailable && measuredTarget.layoutAvailable;
    const nextGeometry = measuredTarget.geometry;
    currentGeometry = nextGeometry;
    currentLayoutAvailable = measuredTarget.layoutAvailable;
    cancelAnimation();
    applyGeometry(indicator, nextGeometry);

    if (!animate || !previousGeometry || !layoutAvailable || !ownerWindow) return;
    const matchMedia = ownerWindow.matchMedia;
    if (typeof matchMedia !== "function" || matchMedia.call(
      ownerWindow,
      "(prefers-reduced-motion: reduce)",
    ).matches) return;
    if (typeof indicator.animate !== "function") return;

    try {
      activeAnimation = indicator.animate(
        [
          frame(previousGeometry, "1, 1", 0),
          frame(midpoint(previousGeometry, nextGeometry), "1.12, .9", 0.5),
          frame(nextGeometry, "1.08, .94", 0.72),
          frame(nextGeometry, ".96, 1.05", 0.88),
          frame(nextGeometry, "1, 1", 1),
        ],
        {
          duration: CLICK_DURATION_MS,
          easing: "cubic-bezier(.16,1,.3,1)",
        },
      );
    } catch {
      activeAnimation = null;
    }
  };

  const markSelected = (target: HomeLiquidTarget): void => {
    selectedTarget = target;
    for (const candidate of targets) {
      candidate.button.classList.toggle("is-home-selected", candidate === target);
    }
  };

  const activateAfterNavigationDelay = (target: HomeLiquidTarget): void => {
    pendingActivation = setTimeout(() => {
      pendingActivation = undefined;
      if (!destroyed && selectedTarget === target) target.activate();
    }, NAVIGATION_DELAY_MS);
  };

  const onClick = (event: Event): void => {
    if (destroyed || !(event.target instanceof Node)) return;
    const target = targets.find((candidate) => candidate.button.contains(event.target as Node));
    if (!target || target.button.disabled) return;

    cancelPendingActivation();
    if (target === selectedTarget) {
      target.activate();
      return;
    }

    markSelected(target);
    moveIndicator(target.button, true);
    if (target.kind === "instant") {
      target.activate();
    } else {
      activateAfterNavigationDelay(target);
    }
  };

  const onResize = (): void => {
    if (destroyed) return;
    moveIndicator(selectedTarget.button, false);
  };

  markSelected(initialTarget);
  moveIndicator(initialTarget.button, false);
  panel.addEventListener("click", onClick);
  ownerWindow?.addEventListener("resize", onResize);

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      cancelPendingActivation();
      cancelAnimation();
      panel.removeEventListener("click", onClick);
      ownerWindow?.removeEventListener("resize", onResize);
      for (const target of targets) {
        target.button.classList.remove("is-home-selected", "is-home-candidate");
      }
    },
  };
}

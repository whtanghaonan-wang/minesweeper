export type HomeLiquidTargetKind = "instant" | "navigation";

export interface HomeLiquidTarget {
  button: HTMLButtonElement;
  kind: HomeLiquidTargetKind;
  activate(): void;
}

export interface HomeLiquidSelectionController {
  cancelAll(): void;
  destroy(): void;
}

const NAVIGATION_DELAY_MS = 220;
const CLICK_DURATION_MS = 580;
const DRAG_SETTLE_MS = 420;
const DRAG_MOVE_THRESHOLD_PX = 5;
const DRAG_FRAME_DELAY_MS = 16;
const MAX_DRAG_VELOCITY_PX_PER_MS = 3;
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
  targetCenterX: number;
  targetCenterY: number;
  targetWidth: number;
  targetHeight: number;
}

interface PanelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PointerSample {
  clientX: number;
  clientY: number;
  timeStamp: number;
}

interface ActiveDrag {
  pointerId: number;
  pressedTarget: HomeLiquidTarget | null;
  startX: number;
  startY: number;
  lastRenderedX: number;
  lastRenderedY: number;
  lastRenderedTime: number;
  originGeometry: TargetGeometry;
  pendingSample: PointerSample | null;
  candidate: HomeLiquidTarget | null;
  frameId: number | null;
  frameKind: "animation" | "timer" | null;
  moved: boolean;
  captured: boolean;
}

interface CompatibilityClickSuppression {
  target: HomeLiquidTarget;
  resetId: number | undefined;
}

interface MagneticTarget {
  target: HomeLiquidTarget;
  geometry: TargetGeometry;
  distance: number;
  threshold: number;
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

function measurePanelBox(panel: HTMLElement): PanelBox | null {
  try {
    const panelRect = panel.getBoundingClientRect();
    if (![panelRect.left, panelRect.top, panelRect.width, panelRect.height].every(
      Number.isFinite,
    )) return null;
    const hasClientWidth = panel.clientWidth > 0;
    const hasClientHeight = panel.clientHeight > 0;
    const box = {
      left: panelRect.left + (hasClientWidth ? panel.clientLeft : 0),
      top: panelRect.top + (hasClientHeight ? panel.clientTop : 0),
      width: hasClientWidth ? panel.clientWidth : panelRect.width,
      height: hasClientHeight ? panel.clientHeight : panelRect.height,
    };
    return Object.values(box).every(Number.isFinite) ? box : null;
  } catch {
    return null;
  }
}

function measureTarget(
  panel: HTMLElement,
  button: HTMLButtonElement,
): MeasuredTarget | null {
  try {
    const panelBox = measurePanelBox(panel);
    const targetRect = button.getBoundingClientRect();
    if (!panelBox) return null;
    const values = [
      targetRect.left,
      targetRect.top,
      targetRect.width,
      targetRect.height,
    ];
    if (!values.every(Number.isFinite)) return null;

    const desiredWidth = Math.max(MIN_TARGET_PX, targetRect.width + TARGET_PADDING_PX * 2);
    const desiredHeight = Math.max(MIN_TARGET_PX, targetRect.height + TARGET_PADDING_PX * 2);
    const width = panelBox.width > 0
      ? Math.min(desiredWidth, Math.max(0, panelBox.width - PANEL_SAFETY_PX * 2))
      : desiredWidth;
    const height = panelBox.height > 0
      ? Math.min(desiredHeight, Math.max(0, panelBox.height - PANEL_SAFETY_PX * 2))
      : desiredHeight;
    const targetCenterX = targetRect.left + targetRect.width / 2 - panelBox.left;
    const targetCenterY = targetRect.top + targetRect.height / 2 - panelBox.top;

    return {
      geometry: {
        left: clampCenter(targetCenterX, width, panelBox.width),
        top: clampCenter(targetCenterY, height, panelBox.height),
        width,
        height,
      },
      layoutAvailable: panelBox.width > 0
        && panelBox.height > 0
        && targetRect.width > 0
        && targetRect.height > 0,
      targetCenterX,
      targetCenterY,
      targetWidth: targetRect.width,
      targetHeight: targetRect.height,
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

  const ownerDocument = panel.ownerDocument;
  const defaultView = ownerDocument.defaultView;
  if (!defaultView) {
    throw new Error("Home liquid selection requires an owner window");
  }
  const ownerWindow: Window & typeof globalThis = defaultView;
  let selectedTarget = initialTarget;
  let currentGeometry: TargetGeometry | null = null;
  let currentLayoutAvailable = false;
  let pendingActivation: number | undefined;
  let activeAnimation: Animation | null = null;
  let activeDrag: ActiveDrag | null = null;
  let activeListenersInstalled = false;
  let layoutObserver: ResizeObserver | null = null;
  let compatibilityClickSuppression: CompatibilityClickSuppression | null = null;
  let destroyed = false;

  const cancelPendingActivation = (): void => {
    if (pendingActivation === undefined) return;
    ownerWindow.clearTimeout(pendingActivation);
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

  const prefersReducedMotion = (): boolean => {
    const matchMedia = ownerWindow.matchMedia;
    if (typeof matchMedia !== "function") return true;
    try {
      return matchMedia.call(ownerWindow, "(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  };

  const moveIndicator = (
    button: HTMLButtonElement,
    animate: boolean,
    duration = CLICK_DURATION_MS,
  ): void => {
    const measuredTarget = measureTarget(panel, button);
    if (!measuredTarget) return;

    const previousGeometry = currentGeometry;
    const layoutAvailable = currentLayoutAvailable && measuredTarget.layoutAvailable;
    const nextGeometry = measuredTarget.geometry;
    currentGeometry = nextGeometry;
    currentLayoutAvailable = measuredTarget.layoutAvailable;
    cancelAnimation();
    applyGeometry(indicator, nextGeometry);

    if (!animate || !previousGeometry || !layoutAvailable) return;
    if (prefersReducedMotion()) return;
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
          duration,
          easing: "cubic-bezier(.16,1,.3,1)",
          fill: "forwards",
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
    pendingActivation = ownerWindow.setTimeout(() => {
      pendingActivation = undefined;
      if (
        !destroyed
        && selectedTarget === target
        && target.button.isConnected
        && !target.button.disabled
      ) target.activate();
    }, NAVIGATION_DELAY_MS);
  };

  const activateSelectedTarget = (target: HomeLiquidTarget): void => {
    if (target.kind === "instant") {
      target.activate();
    } else {
      activateAfterNavigationDelay(target);
    }
  };

  const clearCompatibilitySuppression = (
    expected: CompatibilityClickSuppression | null = compatibilityClickSuppression,
  ): void => {
    if (!expected || compatibilityClickSuppression !== expected) return;
    compatibilityClickSuppression = null;
    if (expected.resetId !== undefined) ownerWindow.clearTimeout(expected.resetId);
    expected.resetId = undefined;
  };

  const suppressCompatibilityClick = (target: HomeLiquidTarget): void => {
    clearCompatibilitySuppression();
    const suppression: CompatibilityClickSuppression = { target, resetId: undefined };
    compatibilityClickSuppression = suppression;
    suppression.resetId = ownerWindow.setTimeout(() => {
      if (compatibilityClickSuppression !== suppression) return;
      suppression.resetId = undefined;
      compatibilityClickSuppression = null;
    }, DRAG_SETTLE_MS);
  };

  const clearCandidateClasses = (): void => {
    for (const target of targets) target.button.classList.remove("is-home-candidate");
  };

  const showCandidate = (
    session: ActiveDrag,
    target: HomeLiquidTarget | null,
  ): void => {
    session.candidate = target;
    for (const candidate of targets) {
      candidate.button.classList.toggle(
        "is-home-candidate",
        candidate === target && candidate !== selectedTarget && !candidate.button.disabled,
      );
    }
  };

  const findMagneticTarget = (x: number, y: number): MagneticTarget | null => {
    let nearest: MagneticTarget | null = null;
    for (const target of targets) {
      if (target.button.disabled) continue;
      const measured = measureTarget(panel, target.button);
      if (!measured) continue;
      const { geometry } = measured;
      const distance = Math.hypot(
        x - measured.targetCenterX,
        y - measured.targetCenterY,
      );
      const threshold = Math.max(
        64,
        Math.min(105, Math.hypot(measured.targetWidth, measured.targetHeight) * 0.58),
      );
      if (distance > threshold || (nearest && distance >= nearest.distance)) continue;
      nearest = { target, geometry, distance, threshold };
    }
    return nearest;
  };

  const writePanelOptics = (x: number, y: number, box: PanelBox): void => {
    const normalizedX = box.width > 0
      ? Math.max(0, Math.min(1, x / box.width))
      : 0.5;
    const normalizedY = box.height > 0
      ? Math.max(0, Math.min(1, y / box.height))
      : 0.5;
    panel.style.setProperty(
      "--glass-x",
      `${Math.round(normalizedX * 10000) / 100}%`,
    );
    panel.style.setProperty(
      "--glass-y",
      `${Math.round(normalizedY * 10000) / 100}%`,
    );
    panel.style.setProperty("--glass-dx", String((normalizedX - 0.5) * 2));
    panel.style.setProperty("--glass-dy", String((normalizedY - 0.5) * 2));
  };

  const applyPointerSample = (session: ActiveDrag, sample: PointerSample): void => {
    if (activeDrag !== session) return;
    const box = measurePanelBox(panel);
    if (!box) return;
    const pointerX = sample.clientX - box.left;
    const pointerY = sample.clientY - box.top;
    const magnetic = findMagneticTarget(pointerX, pointerY);
    const strength = magnetic
      ? Math.max(0, 1 - magnetic.distance / magnetic.threshold)
      : 0;
    const width = magnetic
      ? session.originGeometry.width
        + (magnetic.geometry.width - session.originGeometry.width) * strength
      : session.originGeometry.width;
    const height = magnetic
      ? session.originGeometry.height
        + (magnetic.geometry.height - session.originGeometry.height) * strength
      : session.originGeometry.height;
    const magneticPull = strength * 0.45;
    const desiredX = magnetic
      ? pointerX + (magnetic.geometry.left - pointerX) * magneticPull
      : pointerX;
    const desiredY = magnetic
      ? pointerY + (magnetic.geometry.top - pointerY) * magneticPull
      : pointerY;
    const geometry = {
      left: clampCenter(desiredX, width, box.width),
      top: clampCenter(desiredY, height, box.height),
      width,
      height,
    };
    const rawElapsed = sample.timeStamp - session.lastRenderedTime;
    const elapsed = Number.isFinite(rawElapsed) && rawElapsed > 0
      ? rawElapsed
      : DRAG_FRAME_DELAY_MS;
    const velocityX = Math.min(
      1,
      Math.abs(sample.clientX - session.lastRenderedX)
        / elapsed
        / MAX_DRAG_VELOCITY_PX_PER_MS,
    );
    const velocityY = Math.min(
      1,
      Math.abs(sample.clientY - session.lastRenderedY)
        / elapsed
        / MAX_DRAG_VELOCITY_PX_PER_MS,
    );
    const reduceMotion = prefersReducedMotion();
    const scaleX = reduceMotion
      ? 1
      : Math.max(0.8, Math.min(1.28, 1 + velocityX * 0.28 - velocityY * 0.1));
    const scaleY = reduceMotion
      ? 1
      : Math.max(0.8, Math.min(1.2, 1 + velocityY * 0.2 - velocityX * 0.1));

    session.lastRenderedX = sample.clientX;
    session.lastRenderedY = sample.clientY;
    session.lastRenderedTime = sample.timeStamp;
    currentGeometry = geometry;
    currentLayoutAvailable = box.width > 0 && box.height > 0;
    showCandidate(session, magnetic?.target ?? null);
    applyGeometry(indicator, geometry);
    indicator.style.transform = `${BASE_TRANSFORM} scale(${Math.round(scaleX * 1000) / 1000}, ${
      Math.round(scaleY * 1000) / 1000
    })`;
    writePanelOptics(pointerX, pointerY, box);
  };

  const cancelScheduledFrame = (session: ActiveDrag): void => {
    if (session.frameId === null) return;
    const frameId = session.frameId;
    const frameKind = session.frameKind;
    session.frameId = null;
    session.frameKind = null;
    if (frameKind === "animation") {
      try {
        ownerWindow.cancelAnimationFrame?.(frameId);
      } catch {
        // A partial animation-frame implementation must not strand the drag.
      }
    } else {
      ownerWindow.clearTimeout(frameId);
    }
  };

  const renderPendingSample = (session: ActiveDrag): void => {
    if (activeDrag !== session) return;
    const sample = session.pendingSample;
    session.pendingSample = null;
    if (sample) applyPointerSample(session, sample);
  };

  const schedulePendingSample = (session: ActiveDrag): void => {
    if (session.frameId !== null) return;
    const onFrame = (): void => {
      session.frameId = null;
      session.frameKind = null;
      renderPendingSample(session);
    };
    if (typeof ownerWindow.requestAnimationFrame === "function") {
      try {
        session.frameKind = "animation";
        session.frameId = ownerWindow.requestAnimationFrame(onFrame);
        return;
      } catch {
        session.frameId = null;
        session.frameKind = null;
      }
    }
    session.frameKind = "timer";
    session.frameId = ownerWindow.setTimeout(onFrame, DRAG_FRAME_DELAY_MS);
  };

  const flushPendingSample = (session: ActiveDrag): void => {
    cancelScheduledFrame(session);
    renderPendingSample(session);
  };

  const readPointerTime = (event: PointerEvent, previous?: number): number => {
    if (
      Number.isFinite(event.timeStamp)
      && (previous === undefined || event.timeStamp > previous)
    ) return event.timeStamp;
    try {
      const fallback = ownerWindow.performance.now();
      if (Number.isFinite(fallback) && (previous === undefined || fallback > previous)) {
        return fallback;
      }
    } catch {
      // The deterministic frame interval below keeps velocity finite.
    }
    return (previous ?? 0) + DRAG_FRAME_DELAY_MS;
  };

  const updatePointerSample = (session: ActiveDrag, event: PointerEvent): void => {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    session.moved ||= Math.hypot(
      event.clientX - session.startX,
      event.clientY - session.startY,
    ) > DRAG_MOVE_THRESHOLD_PX;
    const previousTime = session.pendingSample?.timeStamp ?? session.lastRenderedTime;
    session.pendingSample = {
      clientX: event.clientX,
      clientY: event.clientY,
      timeStamp: readPointerTime(event, previousTime),
    };
  };

  const acquirePointerCapture = (session: ActiveDrag): void => {
    if (activeDrag !== session || session.captured) return;
    try {
      const setCapture = panel.setPointerCapture;
      if (typeof setCapture !== "function") return;
      setCapture.call(panel, session.pointerId);
      if (activeDrag === session) session.captured = true;
    } catch {
      session.captured = false;
      // Window-level listeners keep the drag recoverable without capture.
    }
  };

  const releasePointerCapture = (session: ActiveDrag): void => {
    if (!session.captured) return;
    session.captured = false;
    try {
      const hasCapture = panel.hasPointerCapture;
      if (
        typeof hasCapture === "function"
        && !hasCapture.call(panel, session.pointerId)
      ) return;
      const releaseCapture = panel.releasePointerCapture;
      if (typeof releaseCapture === "function") {
        releaseCapture.call(panel, session.pointerId);
      }
    } catch {
      // Capture is an optimization; window end listeners are the fallback.
    }
  };

  function installActiveListeners(): void {
    if (activeListenersInstalled) return;
    activeListenersInstalled = true;
    ownerWindow.addEventListener("pointermove", onActivePointerMove, {
      capture: true,
      passive: false,
    });
    ownerWindow.addEventListener("pointerup", onActivePointerUp, true);
    ownerWindow.addEventListener("pointercancel", onActivePointerCancel, true);
    ownerWindow.addEventListener("blur", onActiveWindowBlur);
    ownerDocument.addEventListener("visibilitychange", onVisibilityChange, true);
  }

  function removeActiveListeners(): void {
    if (!activeListenersInstalled) return;
    activeListenersInstalled = false;
    ownerWindow.removeEventListener("pointermove", onActivePointerMove, true);
    ownerWindow.removeEventListener("pointerup", onActivePointerUp, true);
    ownerWindow.removeEventListener("pointercancel", onActivePointerCancel, true);
    ownerWindow.removeEventListener("blur", onActiveWindowBlur);
    ownerDocument.removeEventListener("visibilitychange", onVisibilityChange, true);
  }

  const clearDragSession = (session: ActiveDrag): void => {
    if (activeDrag !== session) return;
    activeDrag = null;
    cancelScheduledFrame(session);
    session.pendingSample = null;
    clearCandidateClasses();
    panel.classList.remove("is-home-liquid-dragging");
    removeActiveListeners();
    releasePointerCapture(session);
  };

  const cancelActiveDrag = (snapBack: boolean, animate = true): void => {
    const session = activeDrag;
    if (!session) return;
    clearDragSession(session);
    if (snapBack && !destroyed) {
      moveIndicator(selectedTarget.button, animate, DRAG_SETTLE_MS);
    }
  };

  function onActivePointerMove(event: Event): void {
    const pointer = event as PointerEvent;
    const session = activeDrag;
    if (!session || pointer.pointerId !== session.pointerId) return;
    updatePointerSample(session, pointer);
    event.preventDefault();
    if (!session.moved) return;
    schedulePendingSample(session);
  }

  function onActivePointerUp(event: Event): void {
    const pointer = event as PointerEvent;
    const session = activeDrag;
    if (!session || pointer.pointerId !== session.pointerId) return;
    updatePointerSample(session, pointer);
    flushPendingSample(session);
    const moved = session.moved;
    const candidate = session.candidate;
    const pressedTarget = session.pressedTarget;
    clearDragSession(session);
    if (destroyed) return;

    if (!moved) {
      moveIndicator(selectedTarget.button, true, DRAG_SETTLE_MS);
      if (
        pressedTarget
        && pressedTarget === selectedTarget
        && pressedTarget.button.isConnected
        && !pressedTarget.button.disabled
      ) {
        suppressCompatibilityClick(pressedTarget);
        pressedTarget.activate();
      }
      return;
    }

    if (
      moved
      && candidate
      && candidate !== selectedTarget
      && !candidate.button.disabled
    ) {
      cancelPendingActivation();
      markSelected(candidate);
      moveIndicator(candidate.button, true, DRAG_SETTLE_MS);
      suppressCompatibilityClick(candidate);
      activateSelectedTarget(candidate);
      return;
    }
    suppressCompatibilityClick(selectedTarget);
    moveIndicator(selectedTarget.button, true, DRAG_SETTLE_MS);
  }

  function onActivePointerCancel(event: Event): void {
    const pointer = event as PointerEvent;
    if (!activeDrag || pointer.pointerId !== activeDrag.pointerId) return;
    cancelActiveDrag(true);
  }

  function onActiveWindowBlur(): void {
    cancelActiveDrag(true);
  }

  function onVisibilityChange(): void {
    if (ownerDocument.visibilityState === "hidden") cancelActiveDrag(true);
  }

  function onLostPointerCapture(event: Event): void {
    if (event.target !== panel) return;
    const pointer = event as PointerEvent;
    const session = activeDrag;
    if (!session || pointer.pointerId !== session.pointerId) return;
    session.captured = false;
    cancelActiveDrag(true);
  }

  function onNativeDragStart(event: Event): void {
    if (activeDrag) event.preventDefault();
  }

  function onPointerDown(event: Event): void {
    const pointer = event as PointerEvent;
    if (
      destroyed
      || pointer.isPrimary === false
      || (pointer.pointerType === "mouse" && pointer.button !== 0)
      || !(event.target instanceof ownerWindow.Node)
      || !Number.isFinite(pointer.clientX)
      || !Number.isFinite(pointer.clientY)
    ) return;
    const source = event.target as Node;
    if (!indicator.contains(source) && !selectedTarget.button.contains(source)) return;

    if (activeDrag) cancelActiveDrag(true);
    const originGeometry = measureTarget(panel, selectedTarget.button)?.geometry
      ?? currentGeometry;
    if (!originGeometry) return;
    cancelPendingActivation();
    cancelAnimation();
    const pointerId = Number.isFinite(pointer.pointerId) ? pointer.pointerId : 0;
    const session: ActiveDrag = {
      pointerId,
      pressedTarget: selectedTarget.button.contains(source) ? selectedTarget : null,
      startX: pointer.clientX,
      startY: pointer.clientY,
      lastRenderedX: pointer.clientX,
      lastRenderedY: pointer.clientY,
      lastRenderedTime: readPointerTime(pointer),
      originGeometry,
      pendingSample: null,
      candidate: null,
      frameId: null,
      frameKind: null,
      moved: false,
      captured: false,
    };
    activeDrag = session;
    panel.classList.add("is-home-liquid-dragging");
    clearCandidateClasses();
    installActiveListeners();
    acquirePointerCapture(session);
    const box = measurePanelBox(panel);
    if (box) {
      writePanelOptics(pointer.clientX - box.left, pointer.clientY - box.top, box);
    }
  }

  const onClick = (event: Event): void => {
    if (destroyed) return;
    if (!(event.target instanceof ownerWindow.Node)) return;
    const target = targets.find((candidate) => candidate.button.contains(event.target as Node));
    const suppression = compatibilityClickSuppression;
    if (suppression && (event as MouseEvent).detail !== 0) {
      if (!target || target === suppression.target) {
        clearCompatibilitySuppression(suppression);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      clearCompatibilitySuppression(suppression);
    }
    if (!target || target.button.disabled) return;

    cancelPendingActivation();
    if (target === selectedTarget) {
      target.activate();
      return;
    }

    markSelected(target);
    moveIndicator(target.button, true);
    activateSelectedTarget(target);
  };

  const onResize = (): void => {
    if (destroyed) return;
    cancelActiveDrag(false);
    moveIndicator(selectedTarget.button, false);
  };

  const ResizeObserverConstructor = ownerWindow.ResizeObserver as
    | typeof ResizeObserver
    | undefined;
  if (typeof ResizeObserverConstructor === "function") {
    try {
      layoutObserver = new ResizeObserverConstructor(onResize);
      layoutObserver.observe(panel);
      for (const target of targets) layoutObserver.observe(target.button);
    } catch {
      try {
        layoutObserver?.disconnect();
      } catch {
        // Window resize remains the guarded layout fallback.
      }
      layoutObserver = null;
    }
  }

  markSelected(initialTarget);
  moveIndicator(initialTarget.button, false);
  panel.addEventListener("click", onClick);
  panel.addEventListener("pointerdown", onPointerDown, true);
  panel.addEventListener("dragstart", onNativeDragStart);
  panel.addEventListener("lostpointercapture", onLostPointerCapture);
  ownerWindow.addEventListener("resize", onResize);

  const cancelAll = (): void => {
    if (destroyed) return;
    cancelActiveDrag(false);
    cancelPendingActivation();
    clearCompatibilitySuppression();
    cancelAnimation();
    clearCandidateClasses();
    panel.classList.remove("is-home-liquid-dragging");
    moveIndicator(selectedTarget.button, false);
  };

  return {
    cancelAll,
    destroy(): void {
      if (destroyed) return;
      cancelAll();
      destroyed = true;
      panel.removeEventListener("click", onClick);
      panel.removeEventListener("pointerdown", onPointerDown, true);
      panel.removeEventListener("dragstart", onNativeDragStart);
      panel.removeEventListener("lostpointercapture", onLostPointerCapture);
      ownerWindow.removeEventListener("resize", onResize);
      try {
        layoutObserver?.disconnect();
      } catch {
        // A partial observer implementation must not block teardown.
      }
      layoutObserver = null;
      for (const target of targets) {
        target.button.classList.remove("is-home-selected", "is-home-candidate");
      }
    },
  };
}

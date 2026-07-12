export interface LiquidGlassController {
  cancelAll(): void;
  destroy(): void;
}

interface ActivePress {
  pointerId: number;
  target: HTMLElement;
  surface: HTMLElement;
  x: number;
  y: number;
  frame: number | null;
}

type EventRoot = Document | HTMLElement;

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function installLiquidGlass(root: EventRoot): LiquidGlassController {
  const byPointer = new Map<number, ActivePress>();
  const bySurface = new Map<HTMLElement, ActivePress>();
  const keyboardPressed = new Set<HTMLElement>();
  const releaseCleanups = new Map<HTMLElement, () => void>();
  const ownerDocument = root instanceof Document ? root : root.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  let destroyed = false;

  const isWithinRoot = (element: HTMLElement): boolean => root.contains(element);

  const findTarget = (event: Event): HTMLElement | null => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-jelly]")
      : null;
    return target && isWithinRoot(target) ? target : null;
  };

  const findSurface = (target: HTMLElement): HTMLElement | null => {
    const surface = target.matches("[data-liquid-glass]")
      ? target
      : target.closest<HTMLElement>("[data-liquid-glass]");
    return surface && isWithinRoot(surface) ? surface : null;
  };

  const writePoint = (press: ActivePress): void => {
    const rect = press.surface.getBoundingClientRect();
    const x = rect.width > 0 ? clamp((press.x - rect.left) / rect.width) : 0.5;
    const y = rect.height > 0 ? clamp((press.y - rect.top) / rect.height) : 0.5;
    press.surface.style.setProperty("--glass-x", `${Math.round(x * 10000) / 100}%`);
    press.surface.style.setProperty("--glass-y", `${Math.round(y * 10000) / 100}%`);
    press.surface.style.setProperty("--glass-dx", String((x - 0.5) * 2));
    press.surface.style.setProperty("--glass-dy", String((y - 0.5) * 2));
  };

  const restartRelease = (target: HTMLElement): void => {
    releaseCleanups.get(target)?.();
    target.classList.remove("is-glass-pressed", "is-glass-releasing");
    void target.offsetWidth;
    target.classList.add("is-glass-releasing");

    let timeout = 0;
    let startedAt: number | null = null;
    const cleanup = (): void => {
      if (releaseCleanups.get(target) !== cancel) return;
      window.clearTimeout(timeout);
      target.removeEventListener("animationstart", onAnimationStart);
      target.removeEventListener("animationend", onAnimationEnd);
      releaseCleanups.delete(target);
      target.classList.remove("is-glass-releasing");
    };
    const cancel = (): void => cleanup();
    const onAnimationStart = (event: Event): void => {
      if ((event as AnimationEvent).animationName !== "glass-release") return;
      if (releaseCleanups.get(target) !== cancel) return;
      startedAt = event.timeStamp;
    };
    const onAnimationEnd = (event: Event): void => {
      if ((event as AnimationEvent).animationName !== "glass-release") return;
      if (releaseCleanups.get(target) !== cancel || startedAt === null) return;
      if (event.timeStamp < startedAt) return;
      cleanup();
    };

    target.addEventListener("animationstart", onAnimationStart);
    target.addEventListener("animationend", onAnimationEnd);
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    timeout = window.setTimeout(cancel, reduced ? 0 : 500);
    releaseCleanups.set(target, cancel);
  };

  const safelyCancelFrame = (frame: number): void => {
    try {
      cancelAnimationFrame(frame);
    } catch {
      // A failed host cancellation is harmless because callbacks verify active identity.
    }
  };

  const safelyReleaseCapture = (press: ActivePress): void => {
    try {
      if (press.target.hasPointerCapture?.(press.pointerId)) {
        press.target.releasePointerCapture?.(press.pointerId);
      }
    } catch {
      // Capture may already have been lost or be unsupported by the host browser.
    }
  };

  const targetIsActive = (target: HTMLElement): boolean =>
    keyboardPressed.has(target)
    || [...byPointer.values()].some((press) => press.target === target);

  const settleTarget = (target: HTMLElement): void => {
    if (targetIsActive(target)) {
      releaseCleanups.get(target)?.();
      target.classList.remove("is-glass-releasing");
      target.classList.add("is-glass-pressed");
      return;
    }
    if (!target.isConnected) {
      releaseCleanups.get(target)?.();
      target.classList.remove("is-glass-pressed", "is-glass-releasing");
      return;
    }
    restartRelease(target);
  };

  const finishPointer = (pointerId: number): void => {
    const press = byPointer.get(pointerId);
    if (!press) return;
    if (press.frame !== null) safelyCancelFrame(press.frame);
    writePoint(press);
    byPointer.delete(pointerId);
    bySurface.delete(press.surface);
    safelyReleaseCapture(press);
    settleTarget(press.target);
  };

  const onPointerDown = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (pointer.isPrimary === false) return;
    const target = findTarget(event);
    const surface = target ? findSurface(target) : null;
    if (!target || !surface || bySurface.has(surface)) return;

    const press: ActivePress = {
      pointerId: pointer.pointerId ?? 0,
      target,
      surface,
      x: pointer.clientX,
      y: pointer.clientY,
      frame: null,
    };
    byPointer.set(press.pointerId, press);
    bySurface.set(surface, press);
    releaseCleanups.get(target)?.();
    target.classList.remove("is-glass-releasing");
    target.classList.add("is-glass-pressed");
    writePoint(press);
    try {
      target.setPointerCapture?.(press.pointerId);
    } catch {
      // Event delegation still provides a complete cleanup path without capture.
    }
  };

  const onPointerMove = (event: Event): void => {
    const pointer = event as PointerEvent;
    const press = byPointer.get(pointer.pointerId ?? 0);
    if (!press) return;
    if (Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY)) {
      press.x = pointer.clientX;
      press.y = pointer.clientY;
    }
    if (press.frame !== null) return;
    press.frame = requestAnimationFrame(() => {
      press.frame = null;
      if (byPointer.get(press.pointerId) === press) writePoint(press);
    });
  };

  const onPointerEnd = (event: Event): void => {
    const pointer = event as PointerEvent;
    const pointerId = pointer.pointerId ?? 0;
    const press = byPointer.get(pointerId);
    if (press && Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY)) {
      press.x = pointer.clientX;
      press.y = pointer.clientY;
    }
    finishPointer(pointerId);
  };

  const onKeyDown = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (key.key !== "Enter" && key.key !== " ") return;
    const target = findTarget(event);
    const surface = target ? findSurface(target) : null;
    if (!target || !surface || keyboardPressed.has(target)) return;

    keyboardPressed.add(target);
    releaseCleanups.get(target)?.();
    // 共享玻璃面上高光跟随被按目标的中心;目标/表面无布局信息(如 jsdom)时回退表面中心
    const surfaceRect = surface.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const x = surfaceRect.width > 0 && targetRect.width > 0
      ? clamp((targetRect.left + targetRect.width / 2 - surfaceRect.left) / surfaceRect.width)
      : 0.5;
    const y = surfaceRect.height > 0 && targetRect.height > 0
      ? clamp((targetRect.top + targetRect.height / 2 - surfaceRect.top) / surfaceRect.height)
      : 0.5;
    surface.style.setProperty("--glass-x", `${Math.round(x * 10000) / 100}%`);
    surface.style.setProperty("--glass-y", `${Math.round(y * 10000) / 100}%`);
    surface.style.setProperty("--glass-dx", "0");
    surface.style.setProperty("--glass-dy", "0");
    target.classList.remove("is-glass-releasing");
    target.classList.add("is-glass-pressed");
  };

  const releaseKeyboard = (target: HTMLElement): void => {
    if (!keyboardPressed.delete(target)) return;
    settleTarget(target);
  };

  const onKeyEnd = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (event.type !== "blur" && key.key !== "Enter" && key.key !== " ") return;
    for (const pressed of [...keyboardPressed]) releaseKeyboard(pressed);
  };

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerEnd);
  root.addEventListener("pointercancel", onPointerEnd);
  root.addEventListener("lostpointercapture", onPointerEnd);
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("keyup", onKeyEnd);
  root.addEventListener("blur", onKeyEnd, true);
  ownerWindow?.addEventListener("blur", onKeyEnd);

  const cancelAll = (): void => {
    const pointerPresses = [...byPointer.values()];
    const keyboardTargets = [...keyboardPressed];
    byPointer.clear();
    bySurface.clear();
    keyboardPressed.clear();

    for (const press of pointerPresses) {
      if (press.frame !== null) safelyCancelFrame(press.frame);
      safelyReleaseCapture(press);
      press.target.classList.remove("is-glass-pressed", "is-glass-releasing");
    }
    for (const target of keyboardTargets) {
      target.classList.remove("is-glass-pressed", "is-glass-releasing");
    }
    for (const cleanup of [...releaseCleanups.values()]) cleanup();
    releaseCleanups.clear();
  };

  return {
    cancelAll,
    destroy(): void {
      cancelAll();
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerEnd);
      root.removeEventListener("pointercancel", onPointerEnd);
      root.removeEventListener("lostpointercapture", onPointerEnd);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("keyup", onKeyEnd);
      root.removeEventListener("blur", onKeyEnd, true);
      ownerWindow?.removeEventListener("blur", onKeyEnd);
    },
  };
}

export function markStandaloneGlass(
  button: HTMLButtonElement,
  tinted = false,
): HTMLSpanElement {
  button.dataset["liquidGlass"] = "";
  button.dataset["jelly"] = "";
  button.classList.remove("glass-clear", "glass-tinted");
  button.classList.add(tinted ? "glass-tinted" : "glass-clear");

  const existing = [...button.children].find(
    (child): child is HTMLSpanElement =>
      child instanceof HTMLSpanElement && child.classList.contains("glass-content"),
  );
  if (existing) {
    const orderedContent = button.ownerDocument.createDocumentFragment();
    for (const node of [...button.childNodes]) {
      if (node === existing) {
        while (existing.firstChild) orderedContent.appendChild(existing.firstChild);
      } else {
        orderedContent.appendChild(node);
      }
    }
    existing.appendChild(orderedContent);
    button.appendChild(existing);
    return existing;
  }

  const content = button.ownerDocument.createElement("span");
  content.className = "glass-content";
  while (button.firstChild) content.appendChild(button.firstChild);
  button.appendChild(content);
  return content;
}

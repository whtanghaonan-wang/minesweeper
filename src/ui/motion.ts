interface RunningAnimation {
  cleanup(): void;
}

const running = new WeakMap<HTMLElement, RunningAnimation>();

const reducedMotion = (): boolean =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function arm(
  element: HTMLElement,
  className: string,
  animationName: string,
): void {
  const armedAt = performance.now();
  let startedAt: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const state: RunningAnimation = {
    cleanup: () => {
      if (running.get(element) !== state) return;
      if (timeout !== undefined) clearTimeout(timeout);
      element.classList.remove(className);
      element.removeEventListener("animationstart", onAnimationEvent);
      element.removeEventListener("animationend", onAnimationEvent);
      element.removeEventListener("animationcancel", onAnimationEvent);
      running.delete(element);
    },
  };

  const onAnimationEvent = (event: Event): void => {
    const animationEvent = event as AnimationEvent;
    if (animationEvent.animationName !== animationName || event.timeStamp < armedAt) return;
    if (event.type === "animationstart") {
      startedAt = event.timeStamp;
      return;
    }
    if (startedAt === null || event.timeStamp < startedAt) return;
    state.cleanup();
  };

  running.set(element, state);
  element.addEventListener("animationstart", onAnimationEvent);
  element.addEventListener("animationend", onAnimationEvent);
  element.addEventListener("animationcancel", onAnimationEvent);
  element.classList.add(className);
  timeout = setTimeout(state.cleanup, 1000);
}

export function restartFiniteAnimation(
  element: HTMLElement,
  className: string,
  animationName: string,
): void {
  running.get(element)?.cleanup();
  element.classList.remove(className);
  if (reducedMotion()) return;
  void element.offsetWidth;
  arm(element, className, animationName);
}

export function restartFiniteAnimations(
  elements: readonly HTMLElement[],
  reflowRoot: HTMLElement,
  className: string,
  animationName: string,
): void {
  const unique = [...new Set(elements)];
  for (const element of unique) {
    running.get(element)?.cleanup();
    element.classList.remove(className);
  }
  if (unique.length === 0 || reducedMotion()) return;
  void reflowRoot.offsetWidth;
  for (const element of unique) arm(element, className, animationName);
}

/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installHomeLiquidSelection,
  type HomeLiquidTarget,
} from "../src/ui/home-liquid-selection";

interface Fixture {
  panel: HTMLElement;
  indicator: HTMLElement;
  play: HTMLButtonElement;
  select: HTMLButtonElement;
  sound: HTMLButtonElement;
  playActivate: ReturnType<typeof vi.fn>;
  selectActivate: ReturnType<typeof vi.fn>;
  soundActivate: ReturnType<typeof vi.fn>;
  targets: HomeLiquidTarget[];
}

interface PointerLikeInit extends MouseEventInit {
  pointerId?: number;
  pointerType?: string;
  isPrimary?: boolean;
  timeStamp?: number;
}

interface RafQueue {
  request: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  pending(): number;
  flush(): void;
}

const restoreRafQueues: Array<() => void> = [];

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function setRect(element: Element, value: DOMRect): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => value,
  });
}

function setClientBox(
  element: Element,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  Object.defineProperties(element, {
    clientLeft: { configurable: true, value: left },
    clientTop: { configurable: true, value: top },
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
  });
}

function dispatchPointer(
  target: EventTarget,
  type: string,
  init: PointerLikeInit = {},
  ownerWindow: Window = window,
): MouseEvent {
  const event = new (ownerWindow as Window & typeof globalThis).MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: init.button ?? 0,
    buttons: init.buttons ?? (type === "pointerup" || type === "pointercancel" ? 0 : 1),
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    detail: init.detail ?? 0,
  });
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: init.pointerId ?? 1 },
    pointerType: { configurable: true, value: init.pointerType ?? "mouse" },
    isPrimary: { configurable: true, value: init.isPrimary ?? true },
    ...(init.timeStamp === undefined
      ? {}
      : { timeStamp: { configurable: true, value: init.timeStamp } }),
  });
  target.dispatchEvent(event);
  return event;
}

function readIndicatorScale(indicator: HTMLElement): [number, number] {
  const match = indicator.style.transform.match(
    /scale\((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\)/,
  );
  if (!match) throw new Error(`Missing scale transform: ${indicator.style.transform}`);
  return [Number(match[1]), Number(match[2])];
}

function installRafQueue(ownerWindow: Window = window): RafQueue {
  const requestDescriptor = Object.getOwnPropertyDescriptor(ownerWindow, "requestAnimationFrame");
  const cancelDescriptor = Object.getOwnPropertyDescriptor(ownerWindow, "cancelAnimationFrame");
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const request = vi.fn((callback: FrameRequestCallback): number => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number): void => {
    callbacks.delete(id);
  });
  Object.defineProperties(ownerWindow, {
    requestAnimationFrame: { configurable: true, value: request },
    cancelAnimationFrame: { configurable: true, value: cancel },
  });
  restoreRafQueues.push(() => {
    if (requestDescriptor) {
      Object.defineProperty(ownerWindow, "requestAnimationFrame", requestDescriptor);
    } else {
      Reflect.deleteProperty(ownerWindow, "requestAnimationFrame");
    }
    if (cancelDescriptor) {
      Object.defineProperty(ownerWindow, "cancelAnimationFrame", cancelDescriptor);
    } else {
      Reflect.deleteProperty(ownerWindow, "cancelAnimationFrame");
    }
  });
  return {
    request,
    cancel,
    pending: () => callbacks.size,
    flush(): void {
      const queued = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of queued) callback(16);
    },
  };
}

function createFixture(ownerDocument: Document = document): Fixture {
  ownerDocument.body.innerHTML = `
    <section id="panel">
      <div id="indicator"></div>
      <button id="play">Play</button>
      <button id="select">Select</button>
      <button id="sound">Sound</button>
    </section>
  `;

  const panel = ownerDocument.querySelector<HTMLElement>("#panel")!;
  const indicator = ownerDocument.querySelector<HTMLElement>("#indicator")!;
  const play = ownerDocument.querySelector<HTMLButtonElement>("#play")!;
  const select = ownerDocument.querySelector<HTMLButtonElement>("#select")!;
  const sound = ownerDocument.querySelector<HTMLButtonElement>("#sound")!;

  setRect(panel, rect(10, 20, 320, 190));
  setRect(play, rect(30, 70, 250, 60));
  setRect(select, rect(30, 140, 120, 48));
  setRect(sound, rect(240, 140, 54, 48));

  const playActivate = vi.fn();
  const selectActivate = vi.fn();
  const soundActivate = vi.fn();
  const targets: HomeLiquidTarget[] = [
    { button: play, kind: "navigation", activate: playActivate },
    { button: select, kind: "navigation", activate: selectActivate },
    { button: sound, kind: "instant", activate: soundActivate },
  ];

  return {
    panel,
    indicator,
    play,
    select,
    sound,
    playActivate,
    selectActivate,
    soundActivate,
    targets,
  };
}

describe("installHomeLiquidSelection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const restore of restoreRafQueues.splice(0)) restore();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("selects play initially and sizes its lobe to 260 by 70", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    expect(fixture.play.classList.contains("is-home-selected")).toBe(true);
    expect(fixture.select.classList.contains("is-home-selected")).toBe(false);
    expect(fixture.sound.classList.contains("is-home-selected")).toBe(false);
    expect(fixture.indicator.style.width).toBe("260px");
    expect(fixture.indicator.style.height).toBe("70px");
    expect(fixture.indicator.style.left).toBe("145px");
    expect(fixture.indicator.style.top).toBe("80px");
    expect(fixture.indicator.style.transform).toBe("translate(-50%, -50%)");

    controller.destroy();
  });

  it("caps an oversized lobe to the panel inner safety bounds", () => {
    const fixture = createFixture();
    setRect(fixture.panel, rect(10, 20, 100, 50));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    expect(fixture.indicator.style.width).toBe("88px");
    expect(fixture.indicator.style.height).toBe("38px");
    expect(fixture.indicator.style.left).toBe("50px");
    expect(fixture.indicator.style.top).toBe("25px");

    controller.destroy();
  });

  it("positions the lobe from the panel padding box when borders are present", () => {
    const fixture = createFixture();
    setClientBox(fixture.panel, 4, 6, 312, 178);
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    expect(fixture.indicator.style.left).toBe("141px");
    expect(fixture.indicator.style.top).toBe("74px");
    expect(fixture.indicator.style.width).toBe("260px");
    expect(fixture.indicator.style.height).toBe("70px");

    controller.destroy();
  });

  it("activates and selects an instant target once with fallback geometry", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    fixture.sound.click();

    expect(fixture.soundActivate).toHaveBeenCalledTimes(1);
    expect(fixture.sound.classList.contains("is-home-selected")).toBe(true);
    expect(fixture.play.classList.contains("is-home-selected")).toBe(false);
    expect(fixture.indicator.style.width).toBe("64px");
    expect(fixture.indicator.style.height).toBe("58px");
    expect(fixture.indicator.style.left).toBe("257px");
    expect(fixture.indicator.style.top).toBe("144px");

    controller.destroy();
  });

  it("uses the direct fallback when target layout is unavailable", () => {
    const fixture = createFixture();
    const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    Object.defineProperty(fixture.indicator, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    setRect(fixture.sound, rect(0, 0, 0, 0));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    fixture.sound.click();

    expect(fixture.soundActivate).toHaveBeenCalledTimes(1);
    expect(animate).not.toHaveBeenCalled();
    expect(fixture.indicator.style.width).toBe("48px");
    expect(fixture.indicator.style.height).toBe("48px");

    controller.destroy();
  });

  it("animates click movement with the required stretch and settling keyframes", () => {
    const fixture = createFixture();
    const animation = { cancel: vi.fn() } as unknown as Animation;
    const animate = vi.fn(() => animation);
    Object.defineProperty(fixture.indicator, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    fixture.sound.click();

    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0] as unknown as [
      Keyframe[],
      KeyframeAnimationOptions,
    ];
    expect(options).toMatchObject({
      duration: 580,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "forwards",
    });
    expect(keyframes[1]).toMatchObject({
      offset: 0.5,
      transform: "translate(-50%, -50%) scale(1.12, .9)",
    });
    expect(keyframes[2]).toMatchObject({
      offset: 0.72,
      transform: "translate(-50%, -50%) scale(1.08, .94)",
    });
    expect(keyframes[3]).toMatchObject({
      offset: 0.88,
      transform: "translate(-50%, -50%) scale(.96, 1.05)",
    });
    expect(keyframes[4]).toMatchObject({
      offset: 1,
      transform: "translate(-50%, -50%) scale(1, 1)",
    });
    expect(JSON.stringify(keyframes)).not.toContain("rotate");

    controller.destroy();
  });

  it("cancels the prior click animation when selection moves again", () => {
    const fixture = createFixture();
    const firstCancel = vi.fn();
    const secondCancel = vi.fn();
    const animate = vi.fn()
      .mockReturnValueOnce({ cancel: firstCancel } as unknown as Animation)
      .mockReturnValueOnce({ cancel: secondCancel } as unknown as Animation);
    Object.defineProperty(fixture.indicator, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    fixture.sound.click();
    fixture.select.click();

    expect(animate).toHaveBeenCalledTimes(2);
    expect(firstCancel).toHaveBeenCalledTimes(1);
    expect(secondCancel).not.toHaveBeenCalled();

    controller.destroy();
  });

  it("applies final geometry without WAAPI under reduced motion", () => {
    const fixture = createFixture();
    const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    Object.defineProperty(fixture.indicator, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    fixture.sound.click();

    expect(animate).not.toHaveBeenCalled();
    expect(fixture.indicator.style.left).toBe("257px");
    expect(fixture.indicator.style.top).toBe("144px");
    expect(fixture.indicator.style.width).toBe("64px");
    expect(fixture.indicator.style.height).toBe("58px");

    controller.destroy();
  });

  it("remeasures the selected target on resize", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    setRect(fixture.play, rect(100, 100, 100, 48));

    window.dispatchEvent(new Event("resize"));

    expect(fixture.indicator.style.left).toBe("140px");
    expect(fixture.indicator.style.top).toBe("104px");
    expect(fixture.indicator.style.width).toBe("110px");
    expect(fixture.indicator.style.height).toBe("58px");

    controller.destroy();
  });

  it("destroy removes click and resize behavior and cancels animation and navigation", () => {
    const fixture = createFixture();
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
    Object.defineProperty(fixture.indicator, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.sound,
    );
    fixture.select.click();
    const leftAtDestroy = fixture.indicator.style.left;

    controller.destroy();
    setRect(fixture.select, rect(100, 100, 80, 48));
    window.dispatchEvent(new Event("resize"));
    fixture.sound.click();
    vi.runAllTimers();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fixture.indicator.style.left).toBe(leftAtDestroy);
    expect(fixture.soundActivate).not.toHaveBeenCalled();
    expect(fixture.selectActivate).not.toHaveBeenCalled();
    expect(fixture.select.classList.contains("is-home-selected")).toBe(false);
  });

  it("activates a newly selected navigation target at exactly 220ms", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.sound,
    );

    fixture.select.click();
    vi.advanceTimersByTime(219);
    expect(fixture.selectActivate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fixture.selectActivate).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it("does not activate a navigation target detached before its delay expires", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.sound,
    );

    fixture.select.click();
    fixture.select.remove();
    vi.advanceTimersByTime(220);

    expect(fixture.selectActivate).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("does not activate a navigation target disabled before its delay expires", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.sound,
    );

    fixture.select.click();
    fixture.select.disabled = true;
    vi.advanceTimersByTime(220);

    expect(fixture.selectActivate).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("replaces pending navigation without firing the stale callback", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.sound,
    );

    fixture.select.click();
    vi.advanceTimersByTime(100);
    fixture.play.click();
    vi.advanceTimersByTime(120);
    expect(fixture.selectActivate).not.toHaveBeenCalled();
    expect(fixture.playActivate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fixture.selectActivate).not.toHaveBeenCalled();
    expect(fixture.playActivate).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it("activates an already-selected navigation target immediately and only once", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    fixture.play.click();

    expect(fixture.playActivate).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(fixture.playActivate).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it("destroy cancels pending navigation and is idempotent", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.sound,
    );

    fixture.play.click();
    controller.destroy();
    controller.destroy();
    vi.runAllTimers();

    expect(fixture.playActivate).not.toHaveBeenCalled();
    expect(fixture.play.classList.contains("is-home-selected")).toBe(false);
  });

  it("uses the panel owner window for event realm checks and navigation timers", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const ownerDocument = iframe.contentDocument!;
    const ownerWindow = iframe.contentWindow!;
    const fixture = createFixture(ownerDocument);
    const setOwnerTimeout = vi.spyOn(ownerWindow, "setTimeout")
      .mockImplementation(() => 42);
    const clearOwnerTimeout = vi.spyOn(ownerWindow, "clearTimeout")
      .mockImplementation(() => undefined);
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.sound,
    );

    fixture.select.click();

    expect(setOwnerTimeout).toHaveBeenCalledWith(expect.any(Function), 220);
    controller.destroy();
    expect(clearOwnerTimeout).toHaveBeenCalledWith(42);
  });

  it("cancels pending navigation as soon as a valid drag session starts", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.sound,
    );
    fixture.select.click();
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 90,
      clientX: 90,
      clientY: 164,
    });

    vi.advanceTimersByTime(221);
    expect(fixture.selectActivate).not.toHaveBeenCalled();

    dispatchPointer(window, "pointermove", {
      pointerId: 90,
      clientX: 267,
      clientY: 164,
    });
    dispatchPointer(window, "pointerup", {
      pointerId: 90,
      clientX: 267,
      clientY: 164,
    });
    expect(fixture.sound.classList.contains("is-home-selected")).toBe(true);
    expect(fixture.soundActivate).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(fixture.selectActivate).not.toHaveBeenCalled();
    expect(fixture.soundActivate).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it("supports 20 consecutive drags from the newly selected lobe with fresh pointer ids", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    const centers = new Map<HTMLButtonElement, [number, number]>([
      [fixture.play, [155, 100]],
      [fixture.select, [90, 164]],
      [fixture.sound, [267, 164]],
    ]);
    const sequence = Array.from(
      { length: 20 },
      (_, index) => [fixture.select, fixture.sound, fixture.play][index % 3],
    );
    const expected = new Map<HTMLButtonElement, number>();
    let current = fixture.play;

    sequence.forEach((next, index) => {
      const [startX, startY] = centers.get(current)!;
      const [endX, endY] = centers.get(next)!;
      const pointerId = 100 + index;
      dispatchPointer(fixture.indicator, "pointerdown", {
        pointerId,
        clientX: startX,
        clientY: startY,
      });
      dispatchPointer(window, "pointermove", {
        pointerId,
        clientX: endX,
        clientY: endY,
      });
      dispatchPointer(window, "pointerup", {
        pointerId,
        clientX: endX,
        clientY: endY,
      });
      if (next !== fixture.sound) vi.advanceTimersByTime(220);

      expected.set(next, (expected.get(next) ?? 0) + 1);
      expect(next.classList.contains("is-home-selected"), `drag ${index + 1}`).toBe(true);
      expect(fixture.playActivate).toHaveBeenCalledTimes(expected.get(fixture.play) ?? 0);
      expect(fixture.selectActivate).toHaveBeenCalledTimes(expected.get(fixture.select) ?? 0);
      expect(fixture.soundActivate).toHaveBeenCalledTimes(expected.get(fixture.sound) ?? 0);
      current = next;
    });

    expect(fixture.playActivate.mock.calls.length
      + fixture.selectActivate.mock.calls.length
      + fixture.soundActivate.mock.calls.length).toBe(20);
    controller.destroy();
  });

  it("recovers from pointer 41 losing capture before pointer 42 drags successfully", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    dispatchPointer(fixture.play, "pointerdown", {
      pointerId: 41,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 41,
      clientX: 267,
      clientY: 164,
    });
    dispatchPointer(fixture.panel, "lostpointercapture", { pointerId: 41 });

    expect(fixture.indicator.style.left).toBe("145px");
    expect(fixture.indicator.style.top).toBe("80px");
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 42,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 42,
      clientX: 90,
      clientY: 164,
    });
    dispatchPointer(window, "pointerup", {
      pointerId: 42,
      clientX: 90,
      clientY: 164,
    });
    vi.advanceTimersByTime(220);

    expect(fixture.select.classList.contains("is-home-selected")).toBe(true);
    expect(fixture.selectActivate).toHaveBeenCalledTimes(1);
    expect(fixture.playActivate).not.toHaveBeenCalled();
    expect(fixture.soundActivate).not.toHaveBeenCalled();
    controller.destroy();
  });

  it.each([
    ["empty release", (_fixture: Fixture) => {
      dispatchPointer(window, "pointermove", { pointerId: 7, clientX: 320, clientY: 30 });
      dispatchPointer(window, "pointerup", { pointerId: 7, clientX: 320, clientY: 30 });
    }],
    ["return-to-current release", (_fixture: Fixture) => {
      dispatchPointer(window, "pointermove", { pointerId: 7, clientX: 320, clientY: 30 });
      dispatchPointer(window, "pointerup", { pointerId: 7, clientX: 155, clientY: 100 });
    }],
    ["pointer cancellation", (_fixture: Fixture) => {
      dispatchPointer(window, "pointermove", { pointerId: 7, clientX: 267, clientY: 164 });
      dispatchPointer(window, "pointercancel", { pointerId: 7, clientX: 267, clientY: 164 });
    }],
    ["window blur", (_fixture: Fixture) => {
      dispatchPointer(window, "pointermove", { pointerId: 7, clientX: 267, clientY: 164 });
      window.dispatchEvent(new Event("blur"));
    }],
    ["hidden document", (_fixture: Fixture) => {
      dispatchPointer(window, "pointermove", { pointerId: 7, clientX: 267, clientY: 164 });
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    }],
  ])("snaps back without activation after %s", (_, finish) => {
    const fixture = createFixture();
    const addWindowListener = vi.spyOn(window, "addEventListener");
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 7,
      clientX: 155,
      clientY: 100,
    });
    expect(fixture.panel.classList.contains("is-home-liquid-dragging")).toBe(true);
    expect(addWindowListener.mock.calls.some(([type]) => type === "pointermove")).toBe(true);

    finish(fixture);
    vi.runAllTimers();

    expect(fixture.panel.classList.contains("is-home-liquid-dragging")).toBe(false);
    expect(fixture.play.classList.contains("is-home-selected")).toBe(true);
    expect(fixture.indicator.style.left).toBe("145px");
    expect(fixture.indicator.style.top).toBe("80px");
    expect(fixture.indicator.style.transform).not.toContain("rotate");
    expect(fixture.playActivate).not.toHaveBeenCalled();
    expect(fixture.selectActivate).not.toHaveBeenCalled();
    expect(fixture.soundActivate).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("never makes a disabled target a candidate, selection, or activation", () => {
    const fixture = createFixture();
    const raf = installRafQueue();
    fixture.sound.disabled = true;
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 8,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 8,
      clientX: 267,
      clientY: 164,
    });
    expect(raf.request).toHaveBeenCalledTimes(1);
    raf.flush();

    expect(fixture.sound.classList.contains("is-home-candidate")).toBe(false);
    expect(fixture.indicator.style.left).not.toBe("145px");
    dispatchPointer(window, "pointerup", {
      pointerId: 8,
      clientX: 267,
      clientY: 164,
    });
    expect(fixture.play.classList.contains("is-home-selected")).toBe(true);
    expect(fixture.sound.classList.contains("is-home-selected")).toBe(false);
    expect(fixture.soundActivate).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("computes magnetic reach from the button size rather than padded lobe size", () => {
    const fixture = createFixture();
    const raf = installRafQueue();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 81,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 81,
      clientX: 12,
      clientY: 164,
    });
    raf.flush();

    expect(fixture.select.classList.contains("is-home-candidate")).toBe(false);
    dispatchPointer(window, "pointercancel", { pointerId: 81 });
    controller.destroy();
  });

  it("ignores non-primary, right-button, and unselected-target pointer starts", () => {
    const fixture = createFixture();
    const setPointerCapture = vi.fn();
    Object.defineProperty(fixture.panel, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    dispatchPointer(fixture.play, "pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: false,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(fixture.play, "pointerdown", {
      pointerId: 2,
      pointerType: "mouse",
      button: 2,
      buttons: 2,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(fixture.select, "pointerdown", {
      pointerId: 3,
      clientX: 90,
      clientY: 164,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 3,
      clientX: 267,
      clientY: 164,
    });
    dispatchPointer(window, "pointerup", {
      pointerId: 3,
      clientX: 267,
      clientY: 164,
    });

    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(fixture.play.classList.contains("is-home-selected")).toBe(true);
    expect(fixture.soundActivate).not.toHaveBeenCalled();
    dispatchPointer(fixture.play, "pointerdown", {
      pointerId: 4,
      clientX: 155,
      clientY: 100,
    });
    expect(setPointerCapture).toHaveBeenCalledTimes(1);
    dispatchPointer(window, "pointercancel", { pointerId: 4 });
    controller.destroy();
  });

  it("coalesces moves into one frame and flushes the final pointerup sample", () => {
    const fixture = createFixture();
    const raf = installRafQueue();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 9,
      clientX: 155,
      clientY: 100,
    });
    expect(fixture.panel.classList.contains("is-home-liquid-dragging")).toBe(true);

    dispatchPointer(window, "pointermove", { pointerId: 9, clientX: 110, clientY: 145 });
    dispatchPointer(window, "pointermove", { pointerId: 9, clientX: 90, clientY: 164 });
    dispatchPointer(window, "pointermove", { pointerId: 9, clientX: 100, clientY: 160 });

    expect(raf.request).toHaveBeenCalledTimes(1);
    expect(raf.pending()).toBe(1);
    dispatchPointer(window, "pointerup", { pointerId: 9, clientX: 267, clientY: 164 });

    expect(raf.cancel).toHaveBeenCalledTimes(1);
    expect(raf.pending()).toBe(0);
    expect(fixture.panel.classList.contains("is-home-liquid-dragging")).toBe(false);
    expect(fixture.sound.classList.contains("is-home-selected")).toBe(true);
    expect(fixture.soundActivate).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it("normalizes live stretch by elapsed sample time", () => {
    const fixture = createFixture();
    const raf = installRafQueue();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 91,
      clientX: 155,
      clientY: 100,
      timeStamp: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 91,
      clientX: 179,
      clientY: 100,
      timeStamp: 116,
    });
    raf.flush();
    const shortIntervalScale = readIndicatorScale(fixture.indicator);
    dispatchPointer(window, "pointercancel", { pointerId: 91, timeStamp: 117 });

    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 92,
      clientX: 155,
      clientY: 100,
      timeStamp: 200,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 92,
      clientX: 203,
      clientY: 100,
      timeStamp: 232,
    });
    raf.flush();
    const longIntervalScale = readIndicatorScale(fixture.indicator);

    expect(shortIntervalScale.every(Number.isFinite)).toBe(true);
    expect(longIntervalScale.every(Number.isFinite)).toBe(true);
    expect(longIntervalScale[0]).toBeCloseTo(shortIntervalScale[0], 2);
    expect(longIntervalScale[1]).toBeCloseTo(shortIntervalScale[1], 2);
    dispatchPointer(window, "pointercancel", { pointerId: 92, timeStamp: 233 });
    controller.destroy();
  });

  it("preserves physical velocity normalization across a 100ms frame", () => {
    const fixture = createFixture();
    const raf = installRafQueue();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );

    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 95,
      clientX: 155,
      clientY: 100,
      timeStamp: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 95,
      clientX: 171,
      clientY: 100,
      timeStamp: 116,
    });
    raf.flush();
    const normalFrameScale = readIndicatorScale(fixture.indicator);
    dispatchPointer(window, "pointercancel", { pointerId: 95, timeStamp: 117 });

    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 96,
      clientX: 155,
      clientY: 100,
      timeStamp: 200,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 96,
      clientX: 255,
      clientY: 100,
      timeStamp: 300,
    });
    raf.flush();
    const longFrameScale = readIndicatorScale(fixture.indicator);

    expect(normalFrameScale.every(Number.isFinite)).toBe(true);
    expect(longFrameScale.every(Number.isFinite)).toBe(true);
    expect(longFrameScale[0]).toBeCloseTo(normalFrameScale[0], 2);
    expect(longFrameScale[1]).toBeCloseTo(normalFrameScale[1], 2);
    dispatchPointer(window, "pointercancel", { pointerId: 96, timeStamp: 301 });
    controller.destroy();
  });

  it("keeps live velocity output finite for zero, negative, and extreme elapsed time", () => {
    const fixture = createFixture();
    const raf = installRafQueue();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.spyOn(window.performance, "now")
      .mockReturnValueOnce(116)
      .mockReturnValueOnce(132);
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 93,
      clientX: 155,
      clientY: 100,
      timeStamp: 100,
    });

    for (const [clientX, timeStamp] of [[179, 100], [203, 90], [227, 1_000_000]]) {
      dispatchPointer(window, "pointermove", {
        pointerId: 93,
        clientX,
        clientY: 100,
        timeStamp,
      });
      raf.flush();
      const [scaleX, scaleY] = readIndicatorScale(fixture.indicator);
      expect(Number.isFinite(scaleX) && Number.isFinite(scaleY)).toBe(true);
      expect(scaleX).toBeGreaterThanOrEqual(0.8);
      expect(scaleX).toBeLessThanOrEqual(1.28);
      expect(scaleY).toBeGreaterThanOrEqual(0.8);
      expect(scaleY).toBeLessThanOrEqual(1.2);
    }

    dispatchPointer(window, "pointercancel", { pointerId: 93, timeStamp: 1_000_001 });
    controller.destroy();
  });

  it("keeps live drag transform neutral under reduced motion", () => {
    const fixture = createFixture();
    const raf = installRafQueue();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 94,
      clientX: 155,
      clientY: 100,
      timeStamp: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 94,
      clientX: 90,
      clientY: 164,
      timeStamp: 116,
    });
    raf.flush();

    expect(fixture.indicator.style.left).toBe("80px");
    expect(fixture.indicator.style.width).toBe("130px");
    expect(fixture.indicator.style.transform).toBe(
      "translate(-50%, -50%) scale(1, 1)",
    );
    dispatchPointer(window, "pointercancel", { pointerId: 94, timeStamp: 117 });
    controller.destroy();
  });

  it("updates panel optics and deforms a clamped candidate lobe without rotation", () => {
    const fixture = createFixture();
    const raf = installRafQueue();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 10,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 10,
      clientX: 90,
      clientY: 164,
    });
    raf.flush();

    const glassX = fixture.panel.style.getPropertyValue("--glass-x");
    const glassY = fixture.panel.style.getPropertyValue("--glass-y");
    const glassDx = fixture.panel.style.getPropertyValue("--glass-dx");
    const glassDy = fixture.panel.style.getPropertyValue("--glass-dy");
    expect(glassX).toMatch(/^-?\d+(\.\d+)?%$/);
    expect(glassY).toMatch(/^-?\d+(\.\d+)?%$/);
    expect([glassX, glassY, glassDx, glassDy].every((value) => Number.isFinite(
      Number.parseFloat(value),
    ))).toBe(true);
    expect(fixture.select.classList.contains("is-home-candidate")).toBe(true);
    expect(fixture.indicator.style.width).toBe("130px");
    expect(fixture.indicator.style.height).toBe("58px");
    expect(fixture.indicator.style.transform).toContain("scale(");
    expect(fixture.indicator.style.transform).not.toContain("rotate");
    expect(Number.parseFloat(fixture.indicator.style.left)
      - Number.parseFloat(fixture.indicator.style.width) / 2).toBeGreaterThanOrEqual(6);
    expect(Number.parseFloat(fixture.indicator.style.top)
      + Number.parseFloat(fixture.indicator.style.height) / 2).toBeLessThanOrEqual(184);

    dispatchPointer(window, "pointercancel", { pointerId: 10 });
    controller.destroy();
  });

  it("settles a completed drag over 420ms with no rotation keyframes", () => {
    const fixture = createFixture();
    const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    Object.defineProperty(fixture.indicator, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.play, "pointerdown", {
      pointerId: 11,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 11,
      clientX: 267,
      clientY: 164,
    });
    dispatchPointer(window, "pointerup", {
      pointerId: 11,
      clientX: 267,
      clientY: 164,
    });

    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0] as unknown as [
      Keyframe[],
      KeyframeAnimationOptions,
    ];
    expect(options).toMatchObject({
      duration: 420,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "forwards",
    });
    expect(JSON.stringify(keyframes)).not.toContain("rotate");
    controller.destroy();
  });

  it("removes active window listeners after pointer end and destroy", () => {
    const fixture = createFixture();
    const addWindowListener = vi.spyOn(window, "addEventListener");
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const addDocumentListener = vi.spyOn(document, "addEventListener");
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 12,
      clientX: 155,
      clientY: 100,
    });

    for (const type of ["pointermove", "pointerup", "pointercancel", "blur"]) {
      expect(addWindowListener.mock.calls.some(([actual]) => actual === type)).toBe(true);
    }
    expect(addDocumentListener.mock.calls.some(([actual]) => actual === "visibilitychange")).toBe(true);
    dispatchPointer(window, "pointermove", { pointerId: 12, clientX: 267, clientY: 164 });
    dispatchPointer(window, "pointerup", { pointerId: 12, clientX: 267, clientY: 164 });

    for (const type of ["pointermove", "pointerup", "pointercancel", "blur"]) {
      expect(removeWindowListener.mock.calls.some(([actual]) => actual === type)).toBe(true);
    }
    expect(removeDocumentListener.mock.calls.some(
      ([actual]) => actual === "visibilitychange",
    )).toBe(true);
    const leftAfterEnd = fixture.indicator.style.left;
    dispatchPointer(window, "pointermove", { pointerId: 12, clientX: 20, clientY: 20 });
    vi.runOnlyPendingTimers();
    expect(fixture.indicator.style.left).toBe(leftAfterEnd);

    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 13,
      clientX: 267,
      clientY: 164,
    });
    expect(fixture.panel.classList.contains("is-home-liquid-dragging")).toBe(true);
    controller.destroy();
    expect(fixture.panel.classList.contains("is-home-liquid-dragging")).toBe(false);
    const leftAfterDestroy = fixture.indicator.style.left;
    dispatchPointer(window, "pointermove", { pointerId: 13, clientX: 20, clientY: 20 });
    vi.runAllTimers();
    expect(fixture.indicator.style.left).toBe(leftAfterDestroy);
    expect(removeWindowListener.mock.calls.filter(([actual]) => actual === "pointermove")).toHaveLength(2);
    expect(removeDocumentListener.mock.calls.filter(
      ([actual]) => actual === "visibilitychange",
    )).toHaveLength(2);
  });

  it("interrupts an active drag on resize and ignores its stale pointerup", () => {
    const fixture = createFixture();
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 15,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 15,
      clientX: 267,
      clientY: 164,
    });

    window.dispatchEvent(new Event("resize"));
    dispatchPointer(window, "pointerup", {
      pointerId: 15,
      clientX: 267,
      clientY: 164,
    });
    vi.runAllTimers();

    expect(removeWindowListener.mock.calls.some(([type]) => type === "pointermove")).toBe(true);
    expect(fixture.play.classList.contains("is-home-selected")).toBe(true);
    expect(fixture.indicator.style.left).toBe("145px");
    expect(fixture.soundActivate).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("suppresses compatibility clicks for 420ms but preserves detail-zero clicks", () => {
    const fixture = createFixture();
    const controller = installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    );
    dispatchPointer(fixture.indicator, "pointerdown", {
      pointerId: 14,
      clientX: 155,
      clientY: 100,
    });
    dispatchPointer(window, "pointermove", {
      pointerId: 14,
      clientX: 267,
      clientY: 164,
    });
    dispatchPointer(window, "pointerup", {
      pointerId: 14,
      clientX: 267,
      clientY: 164,
    });

    const immediateClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    fixture.sound.dispatchEvent(immediateClick);
    expect(immediateClick.defaultPrevented).toBe(true);
    expect(fixture.soundActivate).toHaveBeenCalledTimes(1);

    fixture.sound.click();
    expect(fixture.soundActivate).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(419);
    fixture.sound.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(fixture.soundActivate).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    fixture.sound.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(fixture.soundActivate).toHaveBeenCalledTimes(3);
    controller.destroy();
  });

  it("rejects a panel whose document has no owner window", () => {
    const ownerDocument = document.implementation.createHTMLDocument("detached");
    const fixture = createFixture(ownerDocument);

    expect(() => installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    )).toThrow(/owner window/i);
  });

  it("rejects an initial button that is not a target", () => {
    const fixture = createFixture();
    const unknown = document.createElement("button");

    expect(() => installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      unknown,
    )).toThrow(/initial.*target/i);
  });

  it("rejects a disabled initial target", () => {
    const fixture = createFixture();
    fixture.play.disabled = true;

    expect(() => installHomeLiquidSelection(
      fixture.panel,
      fixture.indicator,
      fixture.targets,
      fixture.play,
    )).toThrow(/initial.*disabled/i);
  });
});

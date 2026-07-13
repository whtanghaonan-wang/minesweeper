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

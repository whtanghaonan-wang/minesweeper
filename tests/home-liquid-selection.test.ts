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

function createFixture(): Fixture {
  document.body.innerHTML = `
    <section id="panel">
      <div id="indicator"></div>
      <button id="play">Play</button>
      <button id="select">Select</button>
      <button id="sound">Sound</button>
    </section>
  `;

  const panel = document.querySelector<HTMLElement>("#panel")!;
  const indicator = document.querySelector<HTMLElement>("#indicator")!;
  const play = document.querySelector<HTMLButtonElement>("#play")!;
  const select = document.querySelector<HTMLButtonElement>("#select")!;
  const sound = document.querySelector<HTMLButtonElement>("#sound")!;

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

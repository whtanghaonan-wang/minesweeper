/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  restartFiniteAnimation,
  restartFiniteAnimations,
} from "../src/ui/motion";

function animation(type: string, name: string, timeStamp: number): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    animationName: { value: name },
    timeStamp: { value: timeStamp },
  });
  return event;
}

describe("restartFiniteAnimation", () => {
  it("只让当前代在 animationstart 后由 animationend 清类", () => {
    const now = vi.spyOn(performance, "now");
    const el = document.createElement("div");

    now.mockReturnValue(10);
    restartFiniteAnimation(el, "cell-pop", "cell-pop");
    const oldStart = animation("animationstart", "cell-pop", 11);
    const oldEnd = animation("animationend", "cell-pop", 12);

    now.mockReturnValue(20);
    restartFiniteAnimation(el, "cell-pop", "cell-pop");
    el.dispatchEvent(oldStart);
    el.dispatchEvent(oldEnd);
    expect(el.classList.contains("cell-pop")).toBe(true);

    el.dispatchEvent(animation("animationend", "cell-pop", 22));
    expect(el.classList.contains("cell-pop")).toBe(true);
    el.dispatchEvent(animation("animationstart", "cell-pop", 21));
    el.dispatchEvent(animation("animationend", "cell-pop", 22));
    expect(el.classList.contains("cell-pop")).toBe(false);
  });

  it("旧代 animationcancel 不能清新代，当前代 cancel 可以", () => {
    const now = vi.spyOn(performance, "now");
    const el = document.createElement("div");

    now.mockReturnValue(30);
    restartFiniteAnimation(el, "cell-tap", "cell-tap");
    const oldCancel = animation("animationcancel", "cell-tap", 31);
    now.mockReturnValue(40);
    restartFiniteAnimation(el, "cell-tap", "cell-tap");
    el.dispatchEvent(animation("animationstart", "cell-tap", 41));
    el.dispatchEvent(oldCancel);
    expect(el.classList.contains("cell-tap")).toBe(true);
    el.dispatchEvent(animation("animationcancel", "cell-tap", 42));
    expect(el.classList.contains("cell-tap")).toBe(false);
  });

  it("忽略其他动画名并在 1000ms 兜底清理", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    restartFiniteAnimation(el, "cell-pop", "cell-pop");
    const stamp = performance.now() + 1;
    el.dispatchEvent(animation("animationstart", "other", stamp));
    el.dispatchEvent(animation("animationend", "other", stamp + 1));
    expect(el.classList.contains("cell-pop")).toBe(true);
    vi.advanceTimersByTime(999);
    expect(el.classList.contains("cell-pop")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(el.classList.contains("cell-pop")).toBe(false);
  });

  it("减少动态时清理旧代且不添加动画类", () => {
    const el = document.createElement("div");
    restartFiniteAnimation(el, "cell-pop", "cell-pop");
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    restartFiniteAnimation(el, "cell-pop", "cell-pop");
    expect(el.classList.contains("cell-pop")).toBe(false);
  });

  it("批量去重并且 64 格只强制布局一次", () => {
    const root = document.createElement("div");
    const cells = Array.from({ length: 64 }, () => document.createElement("button"));
    root.append(...cells);
    let layoutReads = 0;
    Object.defineProperty(root, "offsetWidth", {
      get: () => { layoutReads++; return 400; },
    });

    restartFiniteAnimations([...cells, cells[0]!], root, "cell-pop", "cell-pop");
    expect(layoutReads).toBe(1);
    expect(cells.every((cell) => cell.classList.contains("cell-pop"))).toBe(true);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

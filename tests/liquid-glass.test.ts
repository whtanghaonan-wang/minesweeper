/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLiquidGlass, markStandaloneGlass } from "../src/ui/liquid-glass";

function pointer(type: string, target: Element, init: {
  id: number;
  x?: number;
  y?: number;
  primary?: boolean;
}): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: Number.isFinite(init.x) ? init.x : 0,
    clientY: Number.isFinite(init.y) ? init.y : 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: init.id },
    isPrimary: { value: init.primary ?? true },
  });
  if (init.x !== undefined) Object.defineProperty(event, "clientX", { value: init.x });
  if (init.y !== undefined) Object.defineProperty(event, "clientY", { value: init.y });
  target.dispatchEvent(event);
}

function animation(type: string, name: string, timeStamp?: number): Event {
  const event = new Event(type);
  Object.defineProperty(event, "animationName", { value: name });
  if (timeStamp !== undefined) Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

describe("installLiquidGlass", () => {
  let surface: HTMLElement;
  let button: HTMLButtonElement;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    document.body.innerHTML = '<div data-liquid-glass><button data-jelly>按下</button></div>';
    surface = document.querySelector<HTMLElement>("[data-liquid-glass]")!;
    button = document.querySelector<HTMLButtonElement>("[data-jelly]")!;
    Object.defineProperty(surface, "getBoundingClientRect", {
      value: () => ({
        left: 10,
        top: 20,
        width: 100,
        height: 50,
        right: 110,
        bottom: 70,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    });
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("pointerdown 同步写坐标/pressed；多次 move 每帧只排一次", () => {
    const controller = installLiquidGlass(document);
    expect(frames).toHaveLength(0);
    pointer("pointerdown", button, { id: 1, x: 35, y: 45 });
    expect(button.classList.contains("is-glass-pressed")).toBe(true);
    expect(surface.style.getPropertyValue("--glass-x")).toBe("25%");
    expect(surface.style.getPropertyValue("--glass-y")).toBe("50%");
    pointer("pointermove", button, { id: 1, x: 60, y: 50 });
    pointer("pointermove", button, { id: 1, x: 80, y: 60 });
    expect(frames).toHaveLength(1);
    frames[0]!(0);
    expect(surface.style.getPropertyValue("--glass-x")).toBe("70%");
    controller.destroy();
  });

  it("同一表面的第二指针不接管；非 primary 指针忽略", () => {
    const controller = installLiquidGlass(document);
    pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
    pointer("pointerdown", button, { id: 2, x: 100, y: 60 });
    expect(surface.style.getPropertyValue("--glass-x")).toBe("10%");
    pointer("pointerup", button, { id: 1, x: 20, y: 30 });
    pointer("pointerdown", button, { id: 3, x: 80, y: 60, primary: false });
    expect(button.classList.contains("is-glass-pressed")).toBe(false);
    controller.destroy();
  });

  it.each(["pointerup", "pointercancel", "lostpointercapture"])(
    "%s 统一释放 pressed 并完成 release 动画清理",
    (endType) => {
      const controller = installLiquidGlass(document);
      pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
      pointer(endType, button, { id: 1, x: 20, y: 30 });
      expect(button.classList.contains("is-glass-pressed")).toBe(false);
      expect(button.classList.contains("is-glass-releasing")).toBe(true);
      button.dispatchEvent(animation("animationend", "other-animation"));
      expect(button.classList.contains("is-glass-releasing")).toBe(true);
      button.dispatchEvent(animation("animationstart", "glass-release"));
      button.dispatchEvent(animation("animationend", "glass-release"));
      expect(button.classList.contains("is-glass-releasing")).toBe(false);
      controller.destroy();
    },
  );

  it("真实派发的旧 release 事件不能清除已启动的新一代 release", () => {
    const controller = installLiquidGlass(document);
    try {
      pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
      pointer("pointerup", button, { id: 1, x: 20, y: 30 });
      const oldCancel = animation("animationcancel", "glass-release");
      const oldEnd = animation("animationend", "glass-release");

      pointer("pointerdown", button, { id: 2, x: 30, y: 40 });
      pointer("pointerup", button, { id: 2, x: 30, y: 40 });
      expect(button.classList.contains("is-glass-releasing")).toBe(true);

      button.dispatchEvent(oldCancel);
      button.dispatchEvent(oldEnd);
      expect(button.classList.contains("is-glass-releasing")).toBe(true);

      button.dispatchEvent(animation("animationstart", "glass-release"));
      button.dispatchEvent(animation("animationend", "glass-release"));
      expect(button.classList.contains("is-glass-releasing")).toBe(false);
    } finally {
      controller.destroy();
    }
  });

  it("当前动画开始后才派发的早期 animationend 仍不能冒充当前完成事件", () => {
    const controller = installLiquidGlass(document);
    try {
      pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
      pointer("pointerup", button, { id: 1, x: 20, y: 30 });
      const staleEnd = animation("animationend", "glass-release", 100);

      button.dispatchEvent(animation("animationstart", "glass-release", 200));
      button.dispatchEvent(staleEnd);
      expect(button.classList.contains("is-glass-releasing")).toBe(true);

      button.dispatchEvent(animation("animationend", "glass-release", 201));
      expect(button.classList.contains("is-glass-releasing")).toBe(false);
    } finally {
      controller.destroy();
    }
  });

  it("animationcancel 即使发生在当前 animationstart 后也不作为完成来源", () => {
    const controller = installLiquidGlass(document);
    try {
      pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
      pointer("pointerup", button, { id: 1, x: 20, y: 30 });
      button.dispatchEvent(animation("animationstart", "glass-release", 200));

      button.dispatchEvent(animation("animationcancel", "glass-release", 201));
      expect(button.classList.contains("is-glass-releasing")).toBe(true);

      button.dispatchEvent(animation("animationend", "glass-release", 202));
      expect(button.classList.contains("is-glass-releasing")).toBe(false);
    } finally {
      controller.destroy();
    }
  });

  it.each(["animationend", "timeout"] as const)(
    "旧 release 的 %s 回调不能清除新一代 release",
    (completion) => {
      vi.useFakeTimers();
      const listenerSpy = vi.spyOn(button, "addEventListener");
      const timeoutSpy = vi.spyOn(window, "setTimeout");
      const controller = installLiquidGlass(document);
      try {
        pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
        pointer("pointerup", button, { id: 1, x: 20, y: 30 });
        const oldListener = listenerSpy.mock.calls.find(([type]) => type === completion)?.[1];
        const oldTimeout = timeoutSpy.mock.calls[0]?.[0];

        pointer("pointerdown", button, { id: 2, x: 30, y: 40 });
        pointer("pointerup", button, { id: 2, x: 30, y: 40 });
        expect(button.classList.contains("is-glass-releasing")).toBe(true);

        if (completion === "timeout") {
          expect(typeof oldTimeout).toBe("function");
          if (typeof oldTimeout === "function") oldTimeout();
        } else {
          expect(oldListener).toBeTypeOf("function");
          if (typeof oldListener === "function") {
            oldListener.call(button, animation(completion, "glass-release"));
          }
        }

        expect(button.classList.contains("is-glass-releasing")).toBe(true);
        controller.cancelAll();
        expect(button.className).not.toContain("is-glass");
      } finally {
        controller.destroy();
      }
    },
  );

  it("pointer 先结束时仍保持键盘按压，键盘最后结束才 release", () => {
    const controller = installLiquidGlass(document);
    try {
      pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

      pointer("pointerup", button, { id: 1, x: 20, y: 30 });
      expect(button.classList.contains("is-glass-pressed")).toBe(true);
      expect(button.classList.contains("is-glass-releasing")).toBe(false);

      button.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      expect(button.classList.contains("is-glass-pressed")).toBe(false);
      expect(button.classList.contains("is-glass-releasing")).toBe(true);
    } finally {
      controller.destroy();
    }
  });

  it("键盘先结束时仍保持 pointer 按压，pointer 最后结束才 release", () => {
    const controller = installLiquidGlass(document);
    try {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      pointer("pointerdown", button, { id: 1, x: 20, y: 30 });

      button.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      expect(button.classList.contains("is-glass-pressed")).toBe(true);
      expect(button.classList.contains("is-glass-releasing")).toBe(false);

      pointer("pointerup", button, { id: 1, x: 20, y: 30 });
      expect(button.classList.contains("is-glass-pressed")).toBe(false);
      expect(button.classList.contains("is-glass-releasing")).toBe(true);
    } finally {
      controller.destroy();
    }
  });

  it("Enter/Space 使用中心高光，快速重复 release 不残留，cancelAll/destroy 清状态", () => {
    const controller = installLiquidGlass(document);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(surface.style.getPropertyValue("--glass-x")).toBe("50%");
    expect(surface.style.getPropertyValue("--glass-y")).toBe("50%");
    expect(button.classList.contains("is-glass-pressed")).toBe(true);
    button.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    expect(button.classList.contains("is-glass-releasing")).toBe(true);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    button.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    button.dispatchEvent(animation("animationstart", "glass-release"));
    button.dispatchEvent(animation("animationend", "glass-release"));
    expect(button.classList.contains("is-glass-releasing")).toBe(false);
    controller.cancelAll();
    expect(button.className).not.toContain("is-glass");
    controller.destroy();
    controller.destroy();
    pointer("pointerdown", button, { id: 3, x: 20, y: 30 });
    expect(button.classList.contains("is-glass-pressed")).toBe(false);
  });

  it("减少动态时 release 在下一任务清理，不等待不存在的 animationend", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const controller = installLiquidGlass(document);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    button.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    expect(button.classList.contains("is-glass-releasing")).toBe(true);
    vi.runOnlyPendingTimers();
    expect(button.classList.contains("is-glass-releasing")).toBe(false);
    controller.destroy();
  });

  it("keydown 后目标被路由移除，body keyup 仍清理断开按钮", () => {
    const controller = installLiquidGlass(document);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    button.remove();
    document.body.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    expect(button.className).not.toContain("is-glass");
    controller.destroy();
  });

  it("keyup 落在另一 jelly 上时释放原始键盘目标", () => {
    surface.insertAdjacentHTML("afterend", '<div data-liquid-glass><button data-jelly>另一项</button></div>');
    const other = document.querySelectorAll<HTMLButtonElement>("[data-jelly]")[1]!;
    const controller = installLiquidGlass(document);
    try {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

      other.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));

      expect(button.classList.contains("is-glass-pressed")).toBe(false);
      expect(button.classList.contains("is-glass-releasing")).toBe(true);
    } finally {
      controller.destroy();
    }
  });

  it.each(["document", "element"] as const)(
    "%s root 通过 owner window blur 清理原始键盘目标并在 destroy 时移除监听",
    (rootKind) => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const removeSpy = vi.spyOn(window, "removeEventListener");
      const root = rootKind === "document" ? document : surface;
      const controller = installLiquidGlass(root);
      try {
        const blurRegistration = addSpy.mock.calls.find(([type]) => type === "blur");
        expect(blurRegistration).toBeDefined();

        button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
        window.dispatchEvent(new Event("blur"));
        expect(button.classList.contains("is-glass-pressed")).toBe(false);
        expect(button.classList.contains("is-glass-releasing")).toBe(true);
      } finally {
        controller.destroy();
      }
      const blurRegistration = addSpy.mock.calls.find(([type]) => type === "blur");
      if (blurRegistration) {
        expect(removeSpy).toHaveBeenCalledWith("blur", blurRegistration[1]);
      }
    },
  );

  it("HTMLElement root 的 target 与 surface 查找都不能越过 root 边界", () => {
    document.body.innerHTML = `
      <div id="outer-target" data-jelly data-liquid-glass>
        <div id="target-root"><span id="plain-child"></span></div>
      </div>
      <div id="outer-surface" data-liquid-glass>
        <div id="surface-root"><button id="inner-target" data-jelly>内层</button></div>
      </div>`;
    const outerTarget = document.querySelector<HTMLElement>("#outer-target")!;
    const outerSurface = document.querySelector<HTMLElement>("#outer-surface")!;
    const targetRoot = document.querySelector<HTMLElement>("#target-root")!;
    const surfaceRoot = document.querySelector<HTMLElement>("#surface-root")!;
    const targetController = installLiquidGlass(targetRoot);
    const surfaceController = installLiquidGlass(surfaceRoot);
    try {
      pointer("pointerdown", document.querySelector("#plain-child")!, { id: 1, x: 1, y: 1 });
      pointer("pointerdown", document.querySelector("#inner-target")!, { id: 2, x: 1, y: 1 });

      expect(outerTarget.className).not.toContain("is-glass");
      expect(outerSurface.getAttribute("style")).toBeNull();
    } finally {
      targetController.destroy();
      surfaceController.destroy();
    }
  });

  it("HTMLElement root 本身可同时作为 jelly target 与 glass surface", () => {
    document.body.innerHTML = '<button data-jelly data-liquid-glass><span>根按钮</span></button>';
    const rootButton = document.querySelector<HTMLButtonElement>("button")!;
    const controller = installLiquidGlass(rootButton);

    pointer("pointerdown", rootButton.querySelector("span")!, { id: 1, x: 0, y: 0 });

    expect(rootButton.classList.contains("is-glass-pressed")).toBe(true);
    controller.destroy();
  });

  it("setPointerCapture 抛错不会留下 pressed 或阻止后续释放", () => {
    Object.defineProperty(button, "setPointerCapture", {
      value: vi.fn(() => { throw new Error("capture failed"); }),
    });
    const controller = installLiquidGlass(document);
    expect(() => pointer("pointerdown", button, { id: 1, x: 20, y: 30 })).not.toThrow();
    expect(button.setPointerCapture).toHaveBeenCalledWith(1);
    expect(button.classList.contains("is-glass-pressed")).toBe(true);
    pointer("pointerup", button, { id: 1, x: 20, y: 30 });
    expect(button.classList.contains("is-glass-pressed")).toBe(false);
    controller.destroy();
  });

  it("cancelAll 即使 releasePointerCapture 抛错仍清理全部状态和 RAF", () => {
    Object.defineProperties(button, {
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn(() => { throw new Error("release failed"); }) },
    });
    const controller = installLiquidGlass(document);
    pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
    pointer("pointermove", button, { id: 1, x: 30, y: 40 });
    expect(() => controller.cancelAll()).not.toThrow();
    expect(button.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(button.className).not.toContain("is-glass");
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it("cancelAnimationFrame 抛错时 cancelAll 仍清理并保持幂等", () => {
    const throwingCancel = vi.fn(() => { throw new Error("raf cancel failed"); });
    vi.stubGlobal("cancelAnimationFrame", throwingCancel);
    const controller = installLiquidGlass(document);
    pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
    pointer("pointermove", button, { id: 1, x: 30, y: 40 });

    try {
      expect(() => controller.cancelAll()).not.toThrow();
      expect(throwingCancel).toHaveBeenCalledTimes(1);
      expect(button.className).not.toContain("is-glass");
      expect(() => controller.cancelAll()).not.toThrow();
    } finally {
      vi.stubGlobal("cancelAnimationFrame", vi.fn());
      controller.destroy();
    }
  });

  it("destroy 清除 release timeout，重复调用不泄漏 timer", () => {
    vi.useFakeTimers();
    const controller = installLiquidGlass(document);
    pointer("pointerdown", button, { id: 1, x: 20, y: 30 });
    pointer("pointerup", button, { id: 1, x: 20, y: 30 });
    expect(vi.getTimerCount()).toBe(1);

    controller.destroy();
    controller.destroy();

    expect(vi.getTimerCount()).toBe(0);
    expect(button.className).not.toContain("is-glass");
  });

  it("pointerup 缺少有限坐标时保留最后有效位置，不写 NaN", () => {
    const controller = installLiquidGlass(document);
    pointer("pointerdown", button, { id: 1, x: 35, y: 45 });
    pointer("pointerup", button, { id: 1, x: Number.NaN, y: Number.NaN });
    expect(surface.style.getPropertyValue("--glass-x")).toBe("25%");
    expect(surface.style.getPropertyValue("--glass-y")).toBe("50%");
    expect(surface.getAttribute("style")).not.toContain("NaN");
    controller.destroy();
  });
});

describe("markStandaloneGlass", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("标记独立玻璃按钮并将原内容安全包进单个 glass-content", () => {
    const button = document.createElement("button");
    button.append("保存 ", document.createElement("strong"));
    button.querySelector("strong")!.textContent = "游戏";
    const content = markStandaloneGlass(button, true);
    expect(button.dataset.liquidGlass).toBe("");
    expect(button.dataset.jelly).toBe("");
    expect(button.classList.contains("glass-tinted")).toBe(true);
    expect(content.className).toBe("glass-content");
    expect(content.textContent).toBe("保存 游戏");
    expect(button.children).toHaveLength(1);
  });

  it("重复标记不嵌套内容包装并可切换 clear/tinted 外观", () => {
    const button = document.createElement("button");
    button.textContent = "重试";
    const first = markStandaloneGlass(button);
    const second = markStandaloneGlass(button, true);
    expect(second).toBe(first);
    expect(button.querySelectorAll(".glass-content")).toHaveLength(1);
    expect(button.classList.contains("glass-clear")).toBe(false);
    expect(button.classList.contains("glass-tinted")).toBe(true);
  });

  it("重复标记会按按钮视觉顺序合并包装前后新增的文本与图标兄弟", () => {
    const button = document.createElement("button");
    const originalIcon = document.createElement("strong");
    originalIcon.textContent = "原";
    button.append("正文", originalIcon);
    const content = markStandaloneGlass(button, true);

    const prefix = document.createTextNode("前置");
    const suffixIcon = document.createElement("i");
    suffixIcon.textContent = "后置图标";
    const tail = document.createTextNode("尾部");
    button.insertBefore(prefix, content);
    button.insertBefore(suffixIcon, content.nextSibling);
    button.appendChild(tail);

    const visualOrder = [...button.childNodes].flatMap((node) =>
      node === content ? [...content.childNodes] : [node],
    );
    const markedAgain = markStandaloneGlass(button, false);

    expect(markedAgain).toBe(content);
    expect(button.childNodes).toHaveLength(1);
    expect(button.firstChild).toBe(content);
    expect(button.querySelectorAll(":scope > .glass-content")).toHaveLength(1);
    expect([...content.childNodes]).toEqual(visualOrder);
    expect(content.textContent).toBe("前置正文原后置图标尾部");
    expect(button.classList.contains("glass-clear")).toBe(true);
    expect(button.classList.contains("glass-tinted")).toBe(false);
  });
});

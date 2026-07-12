/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPwaUpdateCoordinator } from "../src/ui/pwa-update";
import { mountPwaPrompt } from "../src/ui/pwa-prompt";

afterEach(() => { document.body.innerHTML = ""; });

describe("PWA update prompt", () => {
  it("只在安全页 ready 时出现，不抢焦点，稍后与立即更新可用", async () => {
    const keepFocus = document.createElement("button");
    document.body.appendChild(keepFocus);
    keepFocus.focus();
    const update = vi.fn(async () => {});
    const coordinator = createPwaUpdateCoordinator();
    coordinator.setUpdater(update);
    const destroy = mountPwaPrompt(coordinator);
    coordinator.enterRoute("game");
    coordinator.needRefresh();
    expect(document.querySelector(".pwa-update-prompt")).toBeNull();
    coordinator.enterRoute("home");
    const prompt = document.querySelector<HTMLElement>(".pwa-update-prompt")!;
    expect(prompt.tagName).toBe("ASIDE");
    expect(prompt.classList.contains("glass-clear")).toBe(true);
    expect(prompt.hasAttribute("data-liquid-glass")).toBe(true);
    expect(prompt.querySelector(".pwa-update-message")?.getAttribute("role")).toBe("status");
    expect(prompt.querySelector(".pwa-update-message")?.getAttribute("aria-live")).toBe("polite");
    expect(document.activeElement).toBe(keepFocus);
    expect(prompt.querySelectorAll("[data-liquid-glass]")).toHaveLength(0);
    for (const button of prompt.querySelectorAll("button")) {
      expect(button.hasAttribute("data-jelly")).toBe(true);
    }
    prompt.querySelector<HTMLButtonElement>(".pwa-later")!.click();
    expect(document.querySelector(".pwa-update-prompt")).toBeNull();
    coordinator.enterRoute("game");
    coordinator.enterRoute("menu");
    document.querySelector<HTMLButtonElement>(".pwa-now")!.click();
    await Promise.resolve();
    expect(update).toHaveBeenCalledWith(true);
    destroy();
    expect(document.querySelector(".pwa-update-prompt")).toBeNull();
  });

  it("已由其他标签激活时显示重新载入，游戏页仍不抢先刷新", async () => {
    const reload = vi.fn();
    const coordinator = createPwaUpdateCoordinator(reload);
    const destroy = mountPwaPrompt(coordinator);
    coordinator.enterRoute("game");
    coordinator.needRefresh();
    coordinator.controllerChanged();
    expect(document.querySelector(".pwa-update-prompt")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    coordinator.enterRoute("home");
    expect(document.querySelector(".pwa-update-message")?.textContent)
      .toContain("重新载入");
    expect(document.querySelector(".pwa-now")?.textContent).toBe("重新载入");
    document.querySelector<HTMLButtonElement>(".pwa-now")!.click();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("activating 时按钮禁用，重复快照不创建多个提示", () => {
    const coordinator = createPwaUpdateCoordinator();
    coordinator.setUpdater(() => new Promise<void>(() => {}));
    mountPwaPrompt(coordinator);
    coordinator.needRefresh();
    coordinator.enterRoute("home");
    expect(document.querySelectorAll(".pwa-update-prompt")).toHaveLength(1);
    document.querySelector<HTMLButtonElement>(".pwa-now")!.click();
    expect(document.querySelectorAll(".pwa-update-prompt")).toHaveLength(1);
    expect(document.querySelector<HTMLButtonElement>(".pwa-now")!.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>(".pwa-later")!.disabled).toBe(true);
    expect(document.querySelector(".pwa-update-message")?.textContent).toContain("正在更新");
  });

  it("一次按钮点击只触发一次回调，destroy 幂等且订阅后不再渲染", () => {
    const coordinator = createPwaUpdateCoordinator();
    const update = vi.fn(async () => {});
    coordinator.setUpdater(update);
    const destroy = mountPwaPrompt(coordinator);
    coordinator.needRefresh();
    document.querySelector<HTMLButtonElement>(".pwa-now")!.click();
    expect(update).not.toHaveBeenCalled();
    return Promise.resolve().then(() => {
      expect(update).toHaveBeenCalledTimes(1);
      destroy();
      destroy();
      coordinator.enterRoute("game");
      coordinator.enterRoute("home");
      coordinator.needRefresh();
      expect(document.querySelector(".pwa-update-prompt")).toBeNull();
    });
  });
});

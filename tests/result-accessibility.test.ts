/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showResult } from "../src/ui/result";
import { cycleDialogFocus, focusables } from "../src/ui/focus";

let backgroundRoot: HTMLElement;
let activeCell: HTMLButtonElement;
let fallbackCell: HTMLButtonElement;

beforeEach(() => {
  backgroundRoot = document.createElement("main");
  const title = document.createElement("h1");
  title.className = "game-title";
  title.tabIndex = -1;
  activeCell = document.createElement("button");
  activeCell.setAttribute("role", "gridcell");
  activeCell.dataset["logicalIndex"] = "3";
  activeCell.tabIndex = 0;
  fallbackCell = document.createElement("button");
  fallbackCell.setAttribute("role", "gridcell");
  fallbackCell.dataset["logicalIndex"] = "63";
  fallbackCell.tabIndex = -1;
  backgroundRoot.append(title, activeCell, fallbackCell);
  document.body.appendChild(backgroundRoot);
  activeCell.focus();
});

afterEach(() => { document.body.innerHTML = ""; });

function open(restoreFocus: HTMLElement | null = activeCell): HTMLElement {
  showResult({
    won: true,
    timeSec: 0,
    newBest: true,
    persisted: false,
    hasNext: true,
    backgroundRoot,
    restoreFocus,
    onNext: vi.fn(),
    onRetry: vi.fn(),
    onMenu: vi.fn(),
  });
  return document.querySelector<HTMLElement>("[role=dialog]")!;
}

describe("结果 dialog 无障碍", () => {
  it("关联固定标题/摘要，背景 inert，图标隐藏，摘要信息完整", () => {
    const dialog = open();
    expect(dialog.getAttribute("aria-labelledby")).toBe("result-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("result-summary");
    expect(backgroundRoot.inert).toBe(true);
    expect(dialog.querySelector(".modal-icon")!.getAttribute("aria-hidden")).toBe("true");
    expect(dialog.querySelector("#result-summary")!.textContent).toContain("通关");
    expect(dialog.querySelector("#result-summary")!.textContent).toContain("0:00");
    expect(dialog.querySelector("#result-summary")!.textContent).toContain("新纪录");
    expect(dialog.querySelector("#result-summary")!.textContent).toContain("暂未保存");
    expect(document.activeElement).toBe(dialog.querySelector("button"));
  });

  it("Tab 与 Shift+Tab 在 dialog 内双向循环", () => {
    const dialog = open();
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    last.focus();
    last.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab", bubbles: true, cancelable: true,
    }));
    expect(document.activeElement).toBe(first);
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab", shiftKey: true, bubbles: true, cancelable: true,
    }));
    expect(document.activeElement).toBe(last);
  });

  it("焦点落在 dialog 外时，document 级 Tab 仍拉回首尾且 Escape 关闭恢复", () => {
    const dialog = open();
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
    const external = document.createElement("button");
    document.body.appendChild(external);

    external.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab", bubbles: true, cancelable: true,
    }));
    expect(document.activeElement).toBe(buttons[0]);

    external.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab", shiftKey: true, bubbles: true, cancelable: true,
    }));
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);

    external.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    }));
    expect(document.querySelector(".overlay")).toBeNull();
    expect(backgroundRoot.inert).toBe(false);
    expect(document.activeElement).toBe(activeCell);
  });

  it("Escape 清 overlay/inert 并优先恢复原逻辑格", () => {
    const dialog = open();
    dialog.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    }));
    expect(document.querySelector(".overlay")).toBeNull();
    expect(backgroundRoot.inert).toBe(false);
    expect(document.activeElement).toBe(activeCell);
  });

  it("原格不存在时回退到最后 gridcell，再回退游戏标题", () => {
    let dialog = open(activeCell);
    activeCell.remove();
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(fallbackCell);

    fallbackCell.remove();
    dialog = open(null);
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(backgroundRoot.querySelector(".game-title"));
  });

  it("恢复目标虽仍连接但已不属于背景时，回退到最大逻辑格", () => {
    const externalRestore = document.createElement("button");
    document.body.appendChild(externalRestore);
    const dialog = open(externalRestore);

    dialog.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    }));

    expect(document.activeElement).toBe(fallbackCell);
  });

  it("操作按钮先清 overlay/inert 再执行路由回调", () => {
    const onNext = vi.fn(() => {
      expect(document.querySelector(".overlay")).toBeNull();
      expect(backgroundRoot.inert).toBe(false);
    });
    showResult({
      won: true, timeSec: 3, newBest: false, persisted: true, hasNext: true,
      backgroundRoot, restoreFocus: activeCell, onNext, onRetry: vi.fn(), onMenu: vi.fn(),
    });
    document.querySelector<HTMLButtonElement>(".modal-actions .primary")!.click();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("焦点列表排除隐藏、disabled 与 inert 后代", () => {
    const dialog = document.createElement("div");
    const visible = document.createElement("button");
    const disabled = document.createElement("button");
    disabled.disabled = true;
    const hiddenParent = document.createElement("div");
    hiddenParent.hidden = true;
    hiddenParent.append(document.createElement("button"));
    const inertParent = document.createElement("div");
    inertParent.setAttribute("inert", "");
    inertParent.append(document.createElement("button"));
    dialog.append(visible, disabled, hiddenParent, inertParent);
    document.body.appendChild(dialog);

    expect(focusables(dialog)).toEqual([visible]);
  });

  it("焦点列表排除所有 tabIndex 小于零的原生元素并保留正常可见元素", () => {
    const dialog = document.createElement("div");
    const visibleButton = document.createElement("button");
    const visibleLink = document.createElement("a");
    visibleLink.href = "#visible";
    const skippedButton = document.createElement("button");
    skippedButton.tabIndex = -1;
    const skippedLink = document.createElement("a");
    skippedLink.href = "#skipped";
    skippedLink.tabIndex = -2;
    dialog.append(visibleButton, visibleLink, skippedButton, skippedLink);
    document.body.appendChild(dialog);

    expect(focusables(dialog)).toEqual([visibleButton, visibleLink]);
  });

  it("焦点不在 dialog 内时按方向拉回首尾，无可聚焦项时阻止 Tab 逃逸", () => {
    const dialog = document.createElement("div");
    const first = document.createElement("button");
    const last = document.createElement("button");
    const external = document.createElement("button");
    dialog.append(first, last);
    document.body.append(dialog, external);

    external.focus();
    let event = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    cycleDialogFocus(event, dialog);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    external.focus();
    event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true });
    cycleDialogFocus(event, dialog);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    first.remove();
    last.remove();
    event = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    cycleDialogFocus(event, dialog);
    expect(event.defaultPrevented).toBe(true);
  });

  it("连续打开只保留最新 dialog，旧 cleanup 不影响新弹窗", () => {
    const firstNext = vi.fn();
    showResult({
      won: true, timeSec: 1, newBest: false, persisted: true, hasNext: true,
      backgroundRoot, restoreFocus: activeCell,
      onNext: firstNext, onRetry: vi.fn(), onMenu: vi.fn(),
    });
    const staleButton = document.querySelector<HTMLButtonElement>(".modal-actions .primary")!;
    const firstDialog = document.querySelector<HTMLElement>("[role=dialog]")!;

    const secondDialog = open();
    expect(document.querySelectorAll(".overlay")).toHaveLength(1);
    expect(firstDialog.isConnected).toBe(false);
    expect(backgroundRoot.inert).toBe(true);

    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab", bubbles: true, cancelable: true,
    });
    const preventDefault = vi.spyOn(tabEvent, "preventDefault");
    const external = document.createElement("button");
    document.body.appendChild(external);
    external.focus();
    document.dispatchEvent(tabEvent);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(secondDialog.querySelector("button"));

    staleButton.click();
    expect(firstNext).not.toHaveBeenCalled();
    expect(secondDialog.isConnected).toBe(true);
    expect(backgroundRoot.inert).toBe(true);

    secondDialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    secondDialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelectorAll(".overlay")).toHaveLength(0);
    expect(backgroundRoot.inert).toBe(false);
  });
});

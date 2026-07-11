/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { setPersistenceWarning } from "../src/ui/persistence-warning";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("全局存档警告", () => {
  it("重复开启时只显示一个非模态状态提示，关闭后移除", () => {
    setPersistenceWarning(true);
    setPersistenceWarning(true);

    const warnings = document.querySelectorAll(".persistence-warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.getAttribute("role")).toBe("status");
    expect(warnings[0]!.getAttribute("aria-live")).toBe("polite");
    expect(warnings[0]!.textContent).toBe("进度暂未保存，将自动重试");

    setPersistenceWarning(false);
    expect(document.querySelector(".persistence-warning")).toBeNull();
  });

  it("固定提示不拦截交互并避让横屏安全区", () => {
    const css = readFileSync("src/ui/style.css", "utf8");
    const rule = css.match(/\.persistence-warning\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rule).not.toBe("");
    expect(rule).toMatch(/pointer-events:\s*none/);
    expect(rule).toContain("safe-area-inset-left");
    expect(rule).toContain("safe-area-inset-right");
  });
});

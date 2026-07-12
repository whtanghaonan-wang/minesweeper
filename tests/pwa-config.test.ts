import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("prompt PWA config", () => {
  const source = readFileSync("vite.config.ts", "utf8");
  it("使用 prompt 注册且测试构建可注入独立 cacheId", () => {
    expect(source).toContain('registerType: "prompt"');
    expect(source).toContain("injectRegister: false");
    expect(source).toContain('process.env["PWA_TEST_CACHE_ID"]');
    expect(source).not.toContain('registerType: "autoUpdate"');
  });
});

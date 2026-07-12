import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { APP_VERSION } from "../src/version";

describe("APP_VERSION", () => {
  it("等于 package.json 权威版本", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("npm 与 Cargo 发布元数据完整且没有脚手架占位", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, unknown>;
    expect(pkg).toMatchObject({
      private: true,
      description: "A no-guess Minesweeper game with 50 levels and endless mode",
      author: "whtanghaonan-wang",
      repository: "https://github.com/whtanghaonan-wang/minesweeper",
      license: "UNLICENSED",
    });
    const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
    for (const required of [
      'name = "minesweeper"',
      'description = "A no-guess Minesweeper game with 50 levels and endless mode"',
      'authors = ["whtanghaonan-wang"]',
      'repository = "https://github.com/whtanghaonan-wang/minesweeper"',
      "publish = false",
    ]) expect(cargo).toContain(required);
    expect(cargo).not.toMatch(/A Tauri App|authors = \["you"\]|^license\s*=/m);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/version.mjs");
let root: string;

function writeJson(path: string, value: unknown): void {
  writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
}

function resetFixture(): void {
  writeJson("package.json", { name: "minesweeper", version: "2.4.0" });
  writeJson("package-lock.json", {
    name: "minesweeper", version: "2.4.0",
    lockfileVersion: 3, packages: { "": { name: "minesweeper", version: "2.4.0" } },
  });
  writeJson("src-tauri/tauri.conf.json", { version: "2.4.0" });
  writeJson("src-tauri/tauri.android.conf.json", {
    bundle: { android: { minSdkVersion: 24, versionCode: 2_004_000, autoIncrementVersionCode: false } },
  });
  writeFileSync(resolve(root, "src-tauri/Cargo.toml"),
    '[package]\nname = "minesweeper"\nversion = "2.4.0"\nedition = "2021"\n');
}

function run(extra: string[] = [], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script, "check", ...extra, "--root", root], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "minesweeper-version-"));
  mkdirSync(resolve(root, "src-tauri"), { recursive: true });
  resetFixture();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("version.mjs", () => {
  it("一致版本通过", () => {
    expect(run().status).toBe(0);
  });

  it("逐项点名 tauri/Cargo/package-lock 漂移", () => {
    writeJson("src-tauri/tauri.conf.json", { version: "9.9.9" });
    expect(run().stderr).toContain("tauri.conf.json version");
    resetFixture();
    writeFileSync(resolve(root, "src-tauri/Cargo.toml"),
      '[package]\nname = "minesweeper"\nversion = "9.9.9"\n');
    expect(run().stderr).toContain("Cargo.toml version");
    resetFixture();
    const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
    lock.packages[""].version = "9.9.9";
    writeJson("package-lock.json", lock);
    expect(run().stderr).toContain('package-lock.json packages[""]');
    resetFixture();
    const topLevelLock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
    topLevelLock.version = "9.9.9";
    writeJson("package-lock.json", topLevelLock);
    expect(run().stderr).toContain("package-lock.json version");
  });

  it("tag 模式要求 v + package version", () => {
    expect(run(["--tag"], { GITHUB_REF_NAME: "v2.4.1" }).status).toBe(1);
    expect(run(["--tag"], { GITHUB_REF_NAME: "v2.4.0" }).status).toBe(0);
  });

  it("sync 修复 tauri、Cargo 和 lock 两个根版本", () => {
    writeJson("src-tauri/tauri.conf.json", { version: "0.1.0" });
    writeFileSync(resolve(root, "src-tauri/Cargo.toml"),
      '[package]\nname = "minesweeper"\nversion = "0.1.0"\n');
    const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
    lock.version = "0.1.0";
    lock.packages[""].version = "0.1.0";
    writeJson("package-lock.json", lock);
    const sync = spawnSync(process.execPath, [script, "sync", "--root", root], {
      encoding: "utf8",
    });
    expect(sync.status).toBe(0);
    expect(run().status).toBe(0);
  });

  it("点名 Android versionCode 漂移并在 sync 时修复", () => {
    writeJson("src-tauri/tauri.android.conf.json", {
      bundle: { android: { minSdkVersion: 24, versionCode: 1, autoIncrementVersionCode: false } },
    });
    expect(run().stderr).toContain("tauri.android.conf.json versionCode");
    const sync = spawnSync(process.execPath, [script, "sync", "--root", root], { encoding: "utf8" });
    expect(sync.status).toBe(0);
    expect(run().status).toBe(0);
  });
});

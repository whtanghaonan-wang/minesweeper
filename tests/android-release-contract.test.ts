import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/android-release.mjs", "utf8");

describe("android-release.mjs contract", () => {
  it("builds exactly one universal release APK and validates it", () => {
    for (const required of [
      "tauri", "android", "build", "--apk", "aarch64", "armv7", "x86_64",
      "apksigner", "verify", "aapt", "io.github.whtanghaonan.minesweeper",
      "2004000", "SHA256SUMS.txt", "build-metadata.json",
    ]) expect(source).toContain(required);
  });

  it("rejects output outside artifacts and never prints signing secrets", () => {
    expect(source).toContain("OutputDir must be a child of artifacts");
    expect(source).not.toContain("ANDROID_KEY_PASSWORD}");
    expect(source).not.toContain("console.log(process.env");
  });
});

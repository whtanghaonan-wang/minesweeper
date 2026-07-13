import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/android-release.mjs", "utf8");
const androidWorkflow = readFileSync(".github/workflows/android.yml", "utf8");

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

  it("checks signing properties before creating artifacts or building", () => {
    for (const required of [
      "keystore.properties", "storeFile", "password", "keyAlias",
      "Signing properties precondition",
    ]) expect(source).toContain(required);
  });

  it("rejects the artifacts parent itself as an output directory", () => {
    expect(source).toContain('outputRelative === ".."');
  });

  it("imports the digest primitive used for artifact checksums", () => {
    expect(source).toContain('import { createHash } from "node:crypto";');
  });

  it("matches release APKs by an exact release path segment", () => {
    expect(source).toContain('segment.toLowerCase() === "release"');
    expect(source).not.toContain("/release/i.test(path)");
  });

  it("accepts only strict SHA-256 fingerprint formats", () => {
    expect(source).toContain("value.trim()");
    expect(source).toContain("replaceAll(\":\", \"\")");
    expect(source).not.toContain("replace(/[^0-9a-f]/gi, \"\")");
  });

  it("cleans artifacts created by a failed validation", () => {
    expect(source).toContain("unlinkSync");
    expect(source).toContain("finally");
  });

  it("keeps Android CI signing inputs scoped and never publishes a release", () => {
    for (const required of [
      "ANDROID_KEY_BASE64", "ANDROID_KEY_PASSWORD", "ANDROID_KEY_ALIAS",
      "ANDROID_CERT_SHA256", "keystore.properties", "always()",
    ]) expect(androidWorkflow).toContain(required);
    expect(androidWorkflow).not.toContain("action-gh-release");
    expect(androidWorkflow).not.toContain("gh release create");
  });
});

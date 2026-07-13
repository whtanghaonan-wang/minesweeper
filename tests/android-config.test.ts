import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const base = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const android = JSON.parse(readFileSync("src-tauri/tauri.android.conf.json", "utf8"));

describe("Android bundle configuration", () => {
  it("uses the stable package identifier and Android 7 baseline", () => {
    expect(base.identifier).toBe("io.github.whtanghaonan.minesweeper");
    expect(android.bundle.android.minSdkVersion).toBe(24);
  });

  it("uses a deterministic v2.4.0 version code without signing material", () => {
    expect(android.bundle.android).toMatchObject({
      versionCode: 2_004_000,
      autoIncrementVersionCode: false,
    });
    expect(JSON.stringify(android)).not.toMatch(/keystore|password|ANDROID_KEY/i);
  });

  it("keeps the generated Android manifest free of dangerous permissions", () => {
    const manifest = "src-tauri/gen/android/app/src/main/AndroidManifest.xml";
    if (!existsSync(manifest)) return;
    const text = readFileSync(manifest, "utf8");
    for (const permission of ["CAMERA", "ACCESS_FINE_LOCATION", "READ_CONTACTS", "CALL_PHONE"]) {
      expect(text).not.toContain(permission);
    }
  });

  it("commits the generated Android project but not local signing properties", () => {
    expect(existsSync("src-tauri/gen/android/app/build.gradle.kts")).toBe(true);
    expect(existsSync("src-tauri/gen/android/gradlew")).toBe(true);
    expect(readFileSync("src-tauri/gen/android/app/src/main/res/values/strings.xml", "utf8"))
      .toContain(">扫雷<");
    const ignored = readFileSync(".gitignore", "utf8");
    expect(ignored).toContain("src-tauri/gen/android/keystore.properties");
    expect(ignored).toContain("src-tauri/gen/android/.gradle/");
  });

  it("exposes the Tauri CLI script required by the generated Gradle project", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    expect(packageJson.scripts.tauri).toBe("tauri");
  });

  it("loads Android release signing only when local keystore properties exist", () => {
    const gradle = readFileSync("src-tauri/gen/android/app/build.gradle.kts", "utf8");
    expect(gradle).toContain('val keystorePropertiesFile = rootProject.file("keystore.properties")');
    expect(gradle).toContain("val keystoreProperties = Properties()");
    expect(gradle).toMatch(
      /if\s*\(keystorePropertiesFile\.exists\(\)\)\s*\{\s*keystorePropertiesFile\.inputStream\(\)\.use\s*\{\s*keystoreProperties\.load\(it\)/s,
    );
    expect(gradle).toMatch(
      /signingConfigs\s*\{[\s\S]*create\("release"\)[\s\S]*storeFile\s*=\s*file\(keystoreProperties\.getProperty\("storeFile"\)\)[\s\S]*storePassword\s*=\s*keystoreProperties\.getProperty\("password"\)[\s\S]*keyAlias\s*=\s*keystoreProperties\.getProperty\("keyAlias"\)[\s\S]*keyPassword\s*=\s*keystoreProperties\.getProperty\("password"\)/,
    );
    expect(gradle).toMatch(
      /getByName\("release"\)\s*\{\s*if\s*\(keystorePropertiesFile\.exists\(\)\)\s*\{\s*signingConfig\s*=\s*signingConfigs\.getByName\("release"\)/s,
    );
  });
});

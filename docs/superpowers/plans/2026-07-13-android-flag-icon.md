# Android Flag Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default Android launcher icon with the approved text-free Minesweeper flag icon and rebuild a signed v2.4.0 candidate APK.

**Architecture:** Keep the existing Android launcher resource names and manifest references. Add an adaptive icon for Android 8+ using a vector foreground/background, and replace the legacy density PNGs so Android 7 devices receive the same flag artwork.

**Tech Stack:** Android XML drawables and adaptive icons, generated PNG density assets, Tauri Android build, existing Android signing pipeline.

---

## File structure

- Create `src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`: adaptive launcher icon using the flag foreground and off-white background.
- Create `src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`: adaptive round launcher icon with the same layers.
- Modify `src-tauri/gen/android/app/src/main/res/drawable/ic_launcher_background.xml`: warm off-white adaptive icon background.
- Modify `src-tauri/gen/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`: centered charcoal flagpole, coral flag, and sage ground ellipse in the Android safe zone.
- Modify `src-tauri/gen/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` and `ic_launcher_round.png`: legacy density PNGs matching the approved flag artwork.
- Modify `tests/android-config.test.ts`: static launcher-resource regression checks.

### Task 1: Replace and verify the Android launcher icon

**Files:**

- Create: `src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- Create: `src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- Modify: `src-tauri/gen/android/app/src/main/res/drawable/ic_launcher_background.xml`
- Modify: `src-tauri/gen/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`
- Modify: `src-tauri/gen/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png`
- Modify: `src-tauri/gen/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_round.png`
- Modify: `tests/android-config.test.ts`

- [ ] **Step 1: Write the failing launcher-resource test**

Append this test to `tests/android-config.test.ts`:

```ts
it("uses the approved flag artwork for adaptive and legacy launcher icons", () => {
  const adaptive = "src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml";
  const roundAdaptive = "src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml";
  for (const path of [adaptive, roundAdaptive]) {
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("@drawable/ic_launcher_background");
    expect(text).toContain("@drawable/ic_launcher_foreground");
  }
  const foreground = readFileSync("src-tauri/gen/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml", "utf8");
  expect(foreground).toContain("#3F3A34");
  expect(foreground).toContain("#DD7B76");
  expect(foreground).toContain("#A8C3A3");
  for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    const legacy = `src-tauri/gen/android/app/src/main/res/mipmap-${density}/ic_launcher.png`;
    expect(readFileSync(legacy).subarray(1, 4).toString("ascii")).toBe("PNG");
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run tests/android-config.test.ts
```

Expected: FAIL because `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` do not exist.

- [ ] **Step 3: Generate and add the approved flag artwork**

Generate one square, text-free launcher artwork from the approved reference: warm off-white rounded-square tile; centered charcoal flagpole; coral-pink right-facing triangular flag; muted sage-green ground ellipse; no wordmark, device frame, status bar, shadow outside the tile, watermark, or Tauri rings. Downscale the approved PNG into the five Android legacy density sizes (48, 72, 96, 144, 192 px) for both `ic_launcher.png` and `ic_launcher_round.png`.

Replace the adaptive resources with this exact layer contract:

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
```

Use `#F3F0E8` for the background and vector paths using `#3F3A34` (flagpole), `#DD7B76` (flag), and `#A8C3A3` (ground ellipse). Keep the foreground centered with at least 18% edge padding to avoid adaptive-mask cropping.

- [ ] **Step 4: Run focused validation and build a signed candidate**

Run:

```powershell
npx vitest run tests/android-config.test.ts
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable("JAVA_HOME", "User")
$env:ANDROID_HOME = [Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
$env:NDK_HOME = [Environment]::GetEnvironmentVariable("NDK_HOME", "User")
$env:ANDROID_CERT_SHA256 = (Get-Content -Raw "D:\minesweeper-android-signing\certificate-sha256.txt").Trim()
npm run android:release
```

Expected: icon test passes and `artifacts/android/minesweeper-v2.4.0-universal.apk` is recreated with the existing signing fingerprint and three ABIs.

- [ ] **Step 5: Commit only launcher resources and test**

```powershell
git add tests/android-config.test.ts src-tauri/gen/android/app/src/main/res
git commit -m "feat: replace Android launcher icon"
```

Do not add `src-tauri/gen/android/keystore.properties`, `artifacts/`, or `D:\minesweeper-android-signing`.

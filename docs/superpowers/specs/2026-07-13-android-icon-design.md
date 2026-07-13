# Android app icon design

## Goal

Replace the default Tauri launcher icon with the approved Minesweeper flag icon for Android.

## Visual contract

- A warm off-white rounded-square tile forms the icon base.
- A charcoal vertical flagpole and soft coral-pink triangular flag are centered above a muted sage-green ground oval.
- No text appears in the launcher artwork.
- The foreground art keeps Android adaptive-icon safe-zone padding so it is not cropped by circular, squircle, or rounded-square launchers.

## Implementation and verification

- Regenerate the Android launcher foreground/background assets at all required densities.
- Keep the existing `ic_launcher` resource names and manifest references.
- Build a signed candidate APK and inspect the resulting launcher assets before distribution.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const mode = args[0];
const androidVersionCode = (semver) => {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(semver);
  if (!match) throw new Error(`Android versionCode requires canonical x.y.z version, got ${semver}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (!Number.isSafeInteger(code) || code < 1 || code > 2_100_000_000) {
    throw new Error(`Android versionCode out of range: ${code}`);
  }
  return code;
};
const rootIndex = args.indexOf("--root");
if (rootIndex >= 0 && !args[rootIndex + 1]) throw new Error("--root requires a path");
const root = resolve(rootIndex >= 0 ? args[rootIndex + 1] : process.cwd());
const tagMode = args.includes("--tag");
if (mode !== "sync" && mode !== "check") {
  throw new Error("usage: version.mjs sync|check [--tag] [--root path]");
}

const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const writeJson = (path, value) =>
  writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
const pkg = readJson("package.json");
const lock = readJson("package-lock.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const tauriAndroid = readJson("src-tauri/tauri.android.conf.json");
let cargo = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
const cargoMatch = cargo.match(/\[package\][\s\S]*?^version = "([^"]+)"/m);
if (!cargoMatch) throw new Error("Cargo.toml [package].version not found");
const version = pkg.version;
const versionCode = androidVersionCode(version);

if (mode === "sync") {
  if (!lock.packages?.[""]) throw new Error('package-lock.json packages[""] not found');
  lock.version = version;
  lock.packages[""].version = version;
  tauri.version = version;
  tauriAndroid.bundle ??= {};
  tauriAndroid.bundle.android ??= {};
  tauriAndroid.bundle.android.minSdkVersion = 24;
  tauriAndroid.bundle.android.autoIncrementVersionCode = false;
  tauriAndroid.bundle.android.versionCode = versionCode;
  cargo = cargo.replace(/(\[package\][\s\S]*?^version = ")[^"]+(".*$)/m, `$1${version}$2`);
  writeJson("package-lock.json", lock);
  writeJson("src-tauri/tauri.conf.json", tauri);
  writeJson("src-tauri/tauri.android.conf.json", tauriAndroid);
  writeFileSync(resolve(root, "src-tauri/Cargo.toml"), cargo);
  process.exit(0);
}

const mismatches = [];
if (lock.version !== version) mismatches.push("package-lock.json version");
if (lock.packages?.[""]?.version !== version) {
  mismatches.push('package-lock.json packages[""].version');
}
if (tauri.version !== version) mismatches.push("tauri.conf.json version");
if (tauriAndroid.bundle?.android?.versionCode !== versionCode) {
  mismatches.push("tauri.android.conf.json versionCode");
}
if (cargoMatch[1] !== version) mismatches.push("Cargo.toml version");
if (tagMode && process.env.GITHUB_REF_NAME !== `v${version}`) mismatches.push("git tag");
if (mismatches.length > 0) {
  console.error(`version mismatch: ${mismatches.join(", ")}`);
  process.exit(1);
}

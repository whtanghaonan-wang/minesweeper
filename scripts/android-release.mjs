import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const expectedVersion = "2.4.0";
const expectedIdentifier = "io.github.whtanghaonan.minesweeper";
const expectedVersionCode = 2004000;
const requiredAbis = ["arm64-v8a", "armeabi-v7a", "x86_64"];

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a path`);
  return value;
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function normalizeFingerprint(value) {
  const normalized = value.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("ANDROID_CERT_SHA256 must be a SHA-256 certificate fingerprint");
  }
  return normalized;
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32" && /\.(?:bat|cmd)$/i.test(command),
    ...options,
  });
  if (result.error) throw new Error(`${basename(command)} failed: ${result.error.message}`);
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const detail = `${stdout}\n${stderr}`.trim();
    throw new Error(`${basename(command)} exited with code ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return `${stdout}\n${stderr}`;
}

function runBuild() {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["tauri", "android", "build", "--apk", "--target", "aarch64", "armv7", "x86_64", "--ci"];
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw new Error(`tauri android build failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`tauri android build exited with code ${result.status}`);
}

function numericDirectoryEntries(rootPath) {
  if (!existsSync(rootPath)) return [];
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+(?:\.\d+)*$/.test(entry.name))
    .map((entry) => ({ name: entry.name, path: resolve(rootPath, entry.name) }))
    .sort((a, b) => {
      const left = a.name.split(".").map(Number);
      const right = b.name.split(".").map(Number);
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const difference = (right[index] ?? 0) - (left[index] ?? 0);
        if (difference) return difference;
      }
      return 0;
    });
}

function resolveBuildTool(androidHome, toolName) {
  const candidates = process.platform === "win32"
    ? [`${toolName}.exe`, `${toolName}.bat`, toolName]
    : [toolName];
  for (const buildTools of numericDirectoryEntries(resolve(androidHome, "build-tools"))) {
    for (const candidate of candidates) {
      const toolPath = resolve(buildTools.path, candidate);
      if (existsSync(toolPath)) return toolPath;
    }
  }
  throw new Error(`${toolName} not found in ${resolve(androidHome, "build-tools")}`);
}

function findFiles(directory, predicate) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(path, predicate));
    else if (predicate(path)) found.push(path);
  }
  return found;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitValue(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function commitSha() {
  const value = process.env.GITHUB_SHA?.trim() || gitValue(["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error("Unable to determine exact 40-character commit SHA");
  return value.toLowerCase();
}

function toolVersion(command, args) {
  try {
    return runCapture(command, args).trim().split(/\r?\n/)[0] || "unknown";
  } catch {
    return "unknown";
  }
}

function listZipEntries(apkPath) {
  try {
    return runCapture(process.platform === "win32" ? "unzip.exe" : "unzip", ["-Z1", apkPath]);
  } catch (error) {
    if (!/failed|not found|ENOENT/i.test(error.message)) throw error;
    return runCapture(process.platform === "win32" ? "tar.exe" : "tar", ["-tf", apkPath]);
  }
}

function main() {
  const artifactsRoot = resolve(root, "artifacts");
  const outputDir = resolve(root, argumentValue("--output-dir", "artifacts/android"));
  const outputRelative = relative(artifactsRoot, outputDir);
  if (!outputRelative || outputRelative.startsWith(`..${sep}`) || isAbsolute(outputRelative)) {
    throw new Error("OutputDir must be a child of artifacts");
  }

  const pkg = readJson("package.json");
  const tauri = readJson("src-tauri/tauri.conf.json");
  const tauriAndroid = readJson("src-tauri/tauri.android.conf.json");
  const androidBundle = tauriAndroid.bundle?.android;
  if (pkg.version !== expectedVersion) throw new Error(`Expected package version ${expectedVersion}`);
  if (tauri.identifier !== expectedIdentifier) throw new Error(`Expected Android identifier ${expectedIdentifier}`);
  if (androidBundle?.versionCode !== expectedVersionCode) throw new Error(`Expected Android versionCode ${expectedVersionCode}`);

  const javaHome = requireEnvironment("JAVA_HOME");
  const androidHome = requireEnvironment("ANDROID_HOME");
  requireEnvironment("NDK_HOME");
  const expectedFingerprint = normalizeFingerprint(requireEnvironment("ANDROID_CERT_SHA256"));
  const apksigner = resolveBuildTool(androidHome, "apksigner");
  const aapt = resolveBuildTool(androidHome, "aapt");
  if (!existsSync(javaHome)) throw new Error(`JAVA_HOME path does not exist: ${javaHome}`);

  mkdirSync(outputDir, { recursive: true });
  runBuild();

  const apkOutputDir = resolve(root, "src-tauri/gen/android/app/build/outputs/apk");
  const releaseApks = findFiles(apkOutputDir, (path) => extname(path).toLowerCase() === ".apk" && /release/i.test(path));
  const universalApks = releaseApks.filter((path) => /universal/i.test(basename(path)));
  if (universalApks.length !== 1 || releaseApks.length !== 1) {
    throw new Error(`Expected exactly one universal release APK, found ${universalApks.length} universal and ${releaseApks.length} release APKs`);
  }

  const version = pkg.version;
  const apkPath = resolve(outputDir, `minesweeper-v${version}-universal.apk`);
  copyFileSync(universalApks[0], apkPath);

  const signerOutput = runCapture(apksigner, ["verify", "--verbose", "--print-certs", apkPath]);
  const signerMatch = signerOutput.match(/certificate SHA-256 digest:\s*([0-9a-f: ]+)/i);
  if (!signerMatch) throw new Error("Unable to read APK signer SHA-256 fingerprint");
  const signerFingerprint = normalizeFingerprint(signerMatch[1]);
  if (signerFingerprint !== expectedFingerprint) throw new Error("APK signer fingerprint does not match ANDROID_CERT_SHA256");

  const badging = runCapture(aapt, ["dump", "badging", apkPath]);
  for (const required of [
    `name='${expectedIdentifier}'`,
    `versionName='${expectedVersion}'`,
    `versionCode='${expectedVersionCode}'`,
  ]) {
    if (!badging.includes(required)) throw new Error(`APK badging missing ${required}`);
  }

  const zipEntries = listZipEntries(apkPath).split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  for (const abi of requiredAbis) {
    if (!zipEntries.some((entry) => entry.startsWith(`lib/${abi}/`))) throw new Error(`APK missing ABI lib/${abi}/`);
  }

  const artifactSha256 = sha256(apkPath);
  const metadata = {
    commit: commitSha(),
    version,
    identifier: expectedIdentifier,
    versionCode: expectedVersionCode,
    signerSha256: signerFingerprint,
    abis: requiredAbis,
    nodeVersion: process.version,
    rustVersion: toolVersion("rustc", ["--version"]),
    tauriVersion: toolVersion(process.platform === "win32" ? "npx.cmd" : "npx", ["tauri", "--version"]),
    builtAtUtc: new Date().toISOString(),
    apkFilename: basename(apkPath),
    apkSha256: artifactSha256,
  };
  writeFileSync(resolve(outputDir, "SHA256SUMS.txt"), `${artifactSha256}  ${basename(apkPath)}\n`);
  writeFileSync(resolve(outputDir, "build-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Verified ${basename(apkPath)} (${artifactSha256})`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

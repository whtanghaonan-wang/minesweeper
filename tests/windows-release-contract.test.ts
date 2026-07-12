import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/windows-release.ps1");
const windows = describe.skipIf(process.platform !== "win32");

function invoke(args: string[], env: Record<string, string> = {}) {
  return spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", script, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      WINDOWS_CERTIFICATE: "",
      WINDOWS_CERTIFICATE_PASSWORD: "",
      WINDOWS_TIMESTAMP_URL: "",
      ...env,
    },
  });
}

windows("windows-release.ps1 fail-fast contract", () => {
  it("脚本存在且 PowerShell parser 无错误", () => {
    expect(existsSync(script)).toBe(true);
    const parsed = spawnSync("pwsh", [
      "-NoProfile", "-NonInteractive", "-Command",
      '$tokens=$null; $errors=$null; [Management.Automation.Language.Parser]::ParseFile(' +
        '$env:SCRIPT_UNDER_TEST,[ref]$tokens,[ref]$errors) | Out-Null; ' +
        'if ($errors.Count) { $errors | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }',
    ], {
      encoding: "utf8",
      env: { ...process.env, SCRIPT_UNDER_TEST: script },
    });
    expect(parsed.status, `${parsed.stdout}\n${parsed.stderr}`).toBe(0);
  });

  it("部分签名 secrets 在构建前以指定消息失败", () => {
    const result = invoke(["-OutputDir", "artifacts/windows-contract"], {
      WINDOWS_CERTIFICATE: "partial-contract-test",
    });
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toContain("must be all set or all empty");
  });

  it("artifacts 外输出目录在构建前以指定消息失败", () => {
    const result = invoke(["-OutputDir", "."]);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toContain("OutputDir must be a child of");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

type Workflow = {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, {
    steps?: Array<Record<string, unknown>>;
    needs?: string;
    environment?: string | { name?: string };
  }>;
};

const readWorkflow = (path: string): Workflow =>
  parse(readFileSync(path, "utf8")) as Workflow;

describe("GitHub Actions v2.3 闸门", () => {
  it("Windows 同时支持精确候选和标签，只读权限且不自动发布", () => {
    const workflow = readWorkflow(".github/workflows/windows.yml");
    expect(workflow.on?.["workflow_dispatch"]).toBeDefined();
    expect(workflow.on?.["push"]).toEqual({ tags: ["v*"] });
    expect(workflow.permissions).toEqual({ contents: "read" });
    const job = workflow.jobs?.["build"];
    expect(job?.environment).toBe("windows-signing");
    const steps = job?.steps ?? [];
    const text = JSON.stringify(steps);
    for (const required of ["Validate requested candidate SHA format",
      "Verify requested candidate SHA", "npm run version:check",
      "npm run version:check:tag", "npm test", "npm run build:desktop",
      "cargo check --manifest-path src-tauri/Cargo.toml --locked",
      "windows-release.ps1", "actions/upload-artifact@v4"]) {
      expect(text, required).toContain(required);
    }
    const validateIndex = steps.findIndex((step) =>
      step["name"] === "Validate requested candidate SHA format");
    const checkoutIndex = steps.findIndex((step) => step["uses"] === "actions/checkout@v4");
    expect(validateIndex).toBeGreaterThanOrEqual(0);
    expect(validateIndex).toBeLessThan(checkoutIndex);
    const validate = steps[validateIndex]!;
    expect(validate["env"]).toEqual({ REQUESTED_COMMIT: "${{ inputs.commit }}" });
    expect(String(validate["run"])).not.toContain("${{");
    for (const step of steps.filter((entry) => entry["shell"] === "pwsh")) {
      expect(String(step["run"]), String(step["name"])).not.toContain("${{");
    }
    expect(text).toContain("origin/main");
    expect(text).not.toContain("softprops/action-gh-release");
    expect(text).not.toContain("gh release create");
  });

  it("Pages 在 upload 前顺序执行全部版本/测试/PWA/build 闸门", () => {
    const workflow = readWorkflow(".github/workflows/deploy.yml");
    const steps = workflow.jobs?.["build"]?.steps ?? [];
    const runs = steps.map((step) => step["run"]).filter((value): value is string =>
      typeof value === "string");
    expect(runs).toEqual([
      "npm ci",
      "npx playwright install --with-deps chromium webkit",
      "npm run version:check",
      "npm test",
      "npm run test:e2e",
      "npm run test:pwa",
      "npm run build:web",
    ]);
    expect(workflow.jobs?.["deploy"]?.needs).toBe("build");
  });
});

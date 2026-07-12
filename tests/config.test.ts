import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
function parseCsp(value: unknown): { parts: string[]; directives: Record<string, string[]> } {
  const parts = String(value).split(";").map((part) => part.trim()).filter(Boolean);
  return {
    parts,
    directives: Object.fromEntries(parts.map((part) => {
      const [name, ...sources] = part.split(/\s+/);
      return [name!, sources];
    })),
  };
}

const production = parseCsp(config.app.security.csp);
const development = parseCsp(config.app.security.devCsp);

describe("发布安全配置", () => {
  it("CSP 是精确最小白名单", () => {
    expect(production.parts).toHaveLength(9);
    expect(production.directives).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "asset:", "http://asset.localhost", "data:", "blob:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["ipc:", "http://ipc.localhost"],
      "object-src": ["'none'"],
      "base-uri": ["'none'"],
      "frame-ancestors": ["'none'"],
    });
  });
  it("devCsp 只额外放行 Vite HTTP/WebSocket，仍保留生产限制", () => {
    expect(development.parts).toHaveLength(9);
    expect(development.directives).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "asset:", "http://asset.localhost", "data:", "blob:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["ipc:", "http://ipc.localhost", "http://localhost:5173",
        "ws://localhost:5173", "http://127.0.0.1:5173", "ws://127.0.0.1:5173"],
      "object-src": ["'none'"],
      "base-uri": ["'none'"],
      "frame-ancestors": ["'none'"],
    });
  });
  it("allowDowngrades 在 bundle.windows 层严格为 false", () => {
    expect(config.bundle.windows.allowDowngrades).toBe(false);
    expect(config.bundle.windows.nsis.allowDowngrades).toBeUndefined();
  });
});

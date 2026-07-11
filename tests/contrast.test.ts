import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/ui/style.css", "utf8");

function cssVar(name: string): string {
  const match = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`missing CSS variable ${name}`);
  return match[1]!.toLowerCase();
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  return rgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`missing CSS selector ${selector}`);
  return match[1]!;
}

function property(block: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`));
  if (!match) throw new Error(`missing CSS property ${name}`);
  return match[1]!.trim().toLowerCase();
}

function cssRgb(value: string, canvas: [number, number, number] = [255, 255, 255]):
  [number, number, number] {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return rgb(`#${expanded}`);
  }
  const rgba = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!rgba) throw new Error(`unsupported CSS color ${value}`);
  const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
  return [1, 2, 3].map((index) =>
    Math.round(Number(rgba[index]) * alpha + canvas[index - 1]! * (1 - alpha)),
  ) as [number, number, number];
}

function rgbLuminance(value: [number, number, number]): number {
  return value
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
}

function cssContrast(foreground: string, background: string): number {
  const [a, b] = [rgbLuminance(cssRgb(foreground)), rgbLuminance(cssRgb(background))]
    .sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

describe("v2.3 可访问颜色", () => {
  it("正文/状态令牌在纸色和白色上均达到 4.5:1", () => {
    for (const foreground of [cssVar("--ink"), cssVar("--ink-soft")]) {
      for (const background of ["#ffffff", "#f2efe9"]) {
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("各档深色令牌与白字达到 4.5:1", () => {
    for (const name of [
      "--easy",
      "--challenge",
      "--hard",
      "--expert",
      "--abyss",
      "--inferno",
      "--umbra",
      "--void",
      "--chaos",
      "--finale",
    ]) {
      expect(contrast(cssVar(name), "#ffffff"), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("全部数字令牌在揭开格最亮/最暗允许背景达到 4.5:1", () => {
    for (const name of ["--n1", "--n2", "--n3", "--n4", "--n5", "--n6", "--n7", "--n8"]) {
      for (const background of ["#ffffff", "#f2efe9"]) {
        expect(contrast(cssVar(name), background), `${name} on ${background}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("焦点外环在白色和纸色背景均达到 3:1", () => {
    for (const background of ["#ffffff", "#f2efe9"]) {
      expect(contrast(cssVar("--focus"), background), background).toBeGreaterThanOrEqual(3);
    }
  });

  it("首页主按钮实际梯度的两端均可承载白字", () => {
    const block = declarations(".home-play");
    const foreground = property(block, "color");
    const stops = property(block, "background")
      .match(/rgba?\([^)]+\)|#[0-9a-f]{3,6}/gi) ?? [];
    expect(stops).toHaveLength(2);
    for (const stop of stops) {
      expect(cssContrast(foreground, stop), stop).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("无尽档完成节点的实际底色可承载实际白字", () => {
    const tierBlock = declarations(".tier-endless");
    const backgroundDeclaration = property(declarations(".vine-node.done"), "background");
    const tierVariable = backgroundDeclaration.match(/^var\((--[^)]+)\)$/)?.[1];
    expect(tierVariable).toBe("--tier-color");
    const background = property(tierBlock, tierVariable!);
    const foreground = property(declarations(".vine-node.done .vn-num"), "color");
    expect(cssContrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("最佳成绩徽章的实际前景和透明背景达到 4.5:1", () => {
    const block = declarations(".best-badge");
    const foreground = property(block, "color");
    const background = property(block, "background");
    const composited = cssRgb(background);
    const canvas = `#${composited.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    expect(cssContrast(foreground, canvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("viewport 不禁用用户缩放", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).not.toMatch(/user-scalable\s*=\s*no/i);
    expect(html).not.toMatch(/maximum-scale/i);
  });
});

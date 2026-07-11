import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/ui/style.css", "utf8");
const liquidGlassCss = readFileSync("src/ui/liquid-glass.css", "utf8");

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
  return declarationsFrom(css, selector);
}

function declarationsFrom(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`missing CSS selector ${selector}`);
  return match[1]!;
}

function declarationsWithPropertyFrom(
  source: string,
  selector: string,
  propertyName: string,
): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  const propertyPattern = new RegExp(`(?:^|;)\\s*${propertyName}\\s*:`);
  const block = matches.map((match) => match[1]!).find((candidate) => propertyPattern.test(candidate));
  if (!block) throw new Error(`missing CSS property ${propertyName} on ${selector}`);
  return block;
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

function multiplyComposite(
  backdrop: [number, number, number],
  source: [number, number, number],
  alpha: number,
): [number, number, number] {
  return backdrop.map((channel, index) => Math.round(
    channel * (1 - alpha) + channel * source[index]! / 255 * alpha,
  )) as [number, number, number];
}

function rgba(value: string): { rgb: [number, number, number]; alpha: number } {
  const match = value.match(
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i,
  );
  if (!match) throw new Error(`unsupported rgba color ${value}`);
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: Number(match[4]),
  };
}

function hex(value: [number, number, number]): string {
  return `#${value.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
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

  it("Liquid Glass 深色材质的实际梯度两端均可承载白字", () => {
    const block = declarationsFrom(liquidGlassCss, "[data-liquid-glass].glass-tinted");
    const foreground = property(block, "color");
    const variables = property(block, "background")
      .match(/--glass-tinted-(?:start|end)/g) ?? [];
    expect(variables).toEqual(["--glass-tinted-start", "--glass-tinted-end"]);
    const root = declarationsFrom(liquidGlassCss, ":root");
    for (const variable of variables) {
      const stop = property(root, variable);
      for (const canvas of ["#ffffff", "#f2efe9"]) {
        const composited = cssRgb(stop, rgb(canvas));
        const background = `#${composited
          .map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
        expect(cssContrast(foreground, background), `${variable} on ${canvas}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("Liquid Glass 深色材质的实际棱镜与白色高光合成后仍可承载白字", () => {
    const root = declarationsFrom(liquidGlassCss, ":root");
    const tinted = declarationsFrom(liquidGlassCss, "[data-liquid-glass].glass-tinted");
    const foreground = property(tinted, "color");
    const tintVariables = property(tinted, "background")
      .match(/--glass-tinted-(?:start|end)/g) ?? [];
    const before = declarationsWithPropertyFrom(
      liquidGlassCss, "[data-liquid-glass]::before", "background",
    );
    const after = declarationsWithPropertyFrom(
      liquidGlassCss, "[data-liquid-glass]::after", "background",
    );
    const tintedBefore = declarationsFrom(
      liquidGlassCss, "[data-liquid-glass].glass-tinted::before",
    );
    const tintedAfter = declarationsFrom(
      liquidGlassCss, "[data-liquid-glass].glass-tinted::after",
    );
    const prismVariables = property(before, "background").match(/--glass-prism-[a-c]/g) ?? [];
    const highlightColors = property(after, "background").match(/rgba\([^)]*\)/g) ?? [];
    const layers = [
      ...prismVariables.map((variable) => ({
        ...rgba(property(root, variable)),
        pseudoOpacity: Number(property(before, "opacity")),
      })),
      ...highlightColors.map((color) => ({
        ...rgba(color),
        pseudoOpacity: Number(property(after, "opacity")),
      })),
    ];

    expect(property(tintedBefore, "mix-blend-mode")).toBe("multiply");
    expect(property(tintedAfter, "mix-blend-mode")).toBe("multiply");
    expect(prismVariables).toEqual(["--glass-prism-a", "--glass-prism-b", "--glass-prism-c"]);
    expect(highlightColors).toEqual(["rgba(255,255,255,.92)", "rgba(255,255,255,.38)"]);

    for (const tintVariable of tintVariables) {
      const tint = property(root, tintVariable);
      for (const canvas of ["#ffffff", "#f2efe9"]) {
        const backdrop = cssRgb(tint, rgb(canvas));
        for (const layer of layers) {
          const composited = multiplyComposite(
            backdrop, layer.rgb, layer.alpha * layer.pseudoOpacity,
          );
          expect(composited.every((channel, index) => channel <= backdrop[index]!)).toBe(true);
          expect(cssContrast(foreground, hex(composited)), `${tintVariable} + ${layer.rgb}`)
            .toBeGreaterThanOrEqual(4.5);
        }
      }
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

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

type Rgb = [number, number, number];

function rgbaVar(source: string, name: string): { rgb: Rgb; alpha: number } {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(
    `${escaped}\\s*:\\s*rgba\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([.\\d]+)\\s*\\)`,
  ));
  if (!match) throw new Error(`missing rgba variable ${name}`);
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: Number(match[4]),
  };
}

function composite(foreground: Rgb, alpha: number, background: Rgb): Rgb {
  return foreground.map((value, index) =>
    Math.round(value * alpha + background[index]! * (1 - alpha))) as Rgb;
}

function luminance(value: Rgb): number {
  return value.map((channel) => channel / 255).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ).reduce((sum, channel, index) =>
    sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
}

function contrast(a: Rgb, b: Rgb): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

function declarations(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`missing CSS selector ${selector}`);
  return match[1]!;
}

function declarationsWithProperty(source: string, selector: string, property: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  const propertyPattern = new RegExp(`(?:^|;)\\s*${property}\\s*:`);
  const block = matches.map((match) => match[1]!).find((candidate) => propertyPattern.test(candidate));
  if (!block) throw new Error(`missing CSS property ${property} on ${selector}`);
  return block;
}

function optionalDeclarations(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("Liquid Glass 静态约束", () => {
  const glass = readFileSync("src/ui/liquid-glass.css", "utf8");
  const style = readFileSync("src/ui/style.css", "utf8");
  it("同时提供标准/WebKit blur 和无 blur 回退", () => {
    expect(glass).toContain("backdrop-filter: blur(var(--glass-blur))");
    expect(glass).toContain("-webkit-backdrop-filter: blur(var(--glass-blur))");
    expect(glass).toContain("@supports not");
    expect(glass).toContain(".glass-clear");
    expect(glass).toContain(".glass-tinted");
    expect(glass).toContain(".glass-compact");
    expect(glass.match(/--glass-tint-strong/g)?.length).toBeGreaterThan(1);
  });
  it("减少动态、手动实色、增强对比、forced colors 都有回退", () => {
    expect(glass).toContain("prefers-reduced-motion: reduce");
    expect(glass).toContain("data-reduced-transparency");
    expect(glass).toContain("prefers-contrast: more");
    expect(glass).toContain("forced-colors: active");
  });
  it("棋盘/格子规则不含 glass/filter/永久 will-change", () => {
    const boardRules = style.match(/\.board[^}]*}|\.cell[^}]*}/g)?.join("\n") ?? "";
    expect(boardRules).not.toMatch(/backdrop-filter|filter:|will-change/);
  });
  it("禁用态不覆盖 clear glass，遮罩层也不形成嵌套 blur", () => {
    const locked = style.match(/\.home-endless\.locked\s*{([^}]*)}/)?.[1] ?? "";
    const overlay = style.match(/\.overlay\s*{([^}]*)}/)?.[1] ?? "";
    expect(locked).not.toMatch(/\bbackground\s*:/);
    expect(overlay).not.toMatch(/backdrop-filter/);
  });
  it("通用按钮激活态不重复定义 jelly 动态", () => {
    const active = optionalDeclarations(style, ".btn:active");
    expect(active).not.toMatch(/\b(?:transform|filter)\s*:/);
  });
  it("首页主按钮不重复定义 Liquid Glass 材质", () => {
    const homePlay = declarations(style, ".home-play");
    expect(homePlay).not.toMatch(/\b(?:background|backdrop-filter|filter|box-shadow)\s*:/);
  });
  it("透明表面边界合成到白色/纸色后仍达到 3:1", () => {
    const boundary = rgbaVar(glass, "--glass-boundary");
    for (const background of [[255, 255, 255], [242, 239, 233]] as Rgb[]) {
      expect(contrast(composite(boundary.rgb, boundary.alpha, background), background))
        .toBeGreaterThanOrEqual(3);
    }
  });
  it("深色玻璃使用白色内环和绿色外环，且保留原玻璃阴影", () => {
    expect(glass).toContain("[data-liquid-glass].glass-tinted:focus-visible");
    expect(glass).toContain("outline: 3px solid #fff");
    expect(glass).toContain("0 0 0 6px var(--focus), var(--glass-elevation)");
  });
  it("深色玻璃两个透明端点合成后与白字均达到 4.5:1", () => {
    for (const name of ["--glass-tinted-start", "--glass-tinted-end"]) {
      const tint = rgbaVar(glass, name);
      for (const background of [[255, 255, 255], [242, 239, 233]] as Rgb[]) {
        expect(contrast([255, 255, 255], composite(tint.rgb, tint.alpha, background)), name)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("深色玻璃的两个实际伪层均以 multiply 合成", () => {
    for (const selector of [
      "[data-liquid-glass].glass-tinted::before",
      "[data-liquid-glass].glass-tinted::after",
    ]) {
      expect(declarations(glass, selector), selector)
        .toMatch(/(?:^|;)\s*mix-blend-mode\s*:\s*multiply\s*(?:;|$)/);
    }
  });
  it("基础伪层只移动渐变中心，不整体平移出材质边界", () => {
    for (const selector of ["[data-liquid-glass]::before", "[data-liquid-glass]::after"]) {
      const block = declarationsWithProperty(glass, selector, "background");
      expect(block, selector).toContain("var(--glass-x)");
      expect(block, selector).toContain("var(--glass-y)");
      expect(block, selector).not.toMatch(/(?:^|;)\s*transform\s*:/);
    }
  });
});

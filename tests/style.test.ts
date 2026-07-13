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

function blockBodies(source: string, marker: string): string[] {
  const blocks: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const markerStart = source.indexOf(marker, cursor);
    if (markerStart < 0) break;
    const suffixStart = markerStart + marker.length;
    const nextTokenOffset = source.slice(suffixStart).search(/\S/);
    if (nextTokenOffset < 0) break;
    const open = suffixStart + nextTokenOffset;
    if (source[open] !== "{") {
      cursor = suffixStart;
      continue;
    }
    let depth = 0;
    let close = -1;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
    if (close < 0) throw new Error(`missing closing brace after ${marker}`);
    blocks.push(source.slice(open + 1, close));
    cursor = close + 1;
  }
  return blocks;
}

function declarationsInBlock(source: string, marker: string, selector: string): string {
  for (const block of blockBodies(source, marker)) {
    const result = optionalDeclarations(block, selector);
    if (result) return result;
  }
  throw new Error(`missing CSS selector ${selector} inside ${marker}`);
}

describe("Liquid Glass 静态约束", () => {
  const glass = readFileSync("src/ui/liquid-glass.css", "utf8");
  const style = readFileSync("src/ui/style.css", "utf8");
  it("媒体块 helper 只匹配 marker 后空白接左花括号的精确查询", () => {
    const fixture = `
      @media (max-width: 600px), (max-height: 620px) { .combined { width: 1px; } }
      @media (max-width: 600px) { .exact { width: 2px; } }
    `;
    const blocks = blockBodies(fixture, "@media (max-width: 600px)");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain(".exact");
    expect(blocks[0]).not.toContain(".combined");
  });
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
  it("轻玻璃使用 14px 模糊和更低饱和、棱镜、阴影强度", () => {
    const light = declarations(glass, "[data-liquid-glass].glass-light");
    expect(light).toContain("--glass-blur: 14px");
    expect(light).toContain("--glass-saturate: 135%");
    expect(light).toContain("--glass-tint-strong: rgba(245, 249, 245, .44)");
    expect(light).toContain("--glass-shadow: rgba(42, 57, 45, .11)");
    expect(light).toContain("--glass-prism-a: rgba(115, 226, 196, .13)");
    expect(light).toContain("--glass-prism-b: rgba(154, 164, 255, .11)");
    expect(light).toContain("--glass-prism-c: rgba(255, 171, 210, .09)");
    expect(declarations(glass, "[data-liquid-glass].glass-light::before"))
      .toContain("opacity: .42");
    expect(declarations(glass, "[data-liquid-glass].glass-light::after"))
      .toContain("opacity: .46");
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
  it("首页只有外层玻璃和一团同材质液化选中体", () => {
    const homePanel = declarations(style, ".home-panel");
    expect(homePanel).not.toMatch(/\b(?:background|backdrop-filter|filter|box-shadow)\s*:/);
    expect(homePanel).toContain("--glass-radius: 999px");
    expect(homePanel).toContain("--glass-prism-c: rgba(118, 196, 183, 0.18)");
    expect(homePanel).not.toContain("255, 171, 210");

    const lobe = declarations(style, ".home-liquid-selection");
    expect(lobe).toContain("position: absolute");
    expect(lobe).toContain("border-radius: 999px");
    expect(lobe).toContain("backdrop-filter: blur(28px) saturate(180%)");
    expect(lobe).toContain("pointer-events: auto");
    expect(lobe).not.toContain("255, 171, 210");

    for (const selector of [
      ".home-play",
      ".home-select,\n.home-endless",
      ".sound-btn,\n.transparency-btn",
    ]) {
      const block = declarations(style, selector);
      expect(block).not.toMatch(/\bbackground\s*:/);
      expect(block).not.toMatch(/\bborder(?:-(?!radius\b)[\w-]+)?\s*:/);
      expect(block).not.toMatch(/\bbox-shadow\s*:/);
      expect(block).not.toMatch(/\b(?:-webkit-)?backdrop-filter\s*:/);
      expect(block).not.toContain("color: #fff");
    }

    const target = declarations(style, ".home-liquid-target");
    expect(target).toContain("background: transparent");
    expect(target).toContain("border: 0");
    expect(target).toContain("box-shadow: none");
    expect(style).toContain(".home-liquid-target.is-home-selected");
    expect(style).toContain("#005fc7");
    expect(style).toContain("html[data-reduced-transparency] .home-liquid-selection");
    expect(style).toContain("@media (forced-colors: active)");
  });
  it("v2.4 首页在桌面和中间宽度保持横向胶囊，窄屏再改为双层触控条", () => {
    const home = declarations(style, ".home");
    expect(home).toContain("max-width: none");
    const panel = declarations(style, ".home-panel");
    expect(panel).toContain("--glass-radius: 999px");
    expect(panel).toContain("grid-template-areas");
    expect(panel).toContain("max-width: 54rem");
    expect(style).toContain(".home-secondary-actions");
    expect(style).toContain(".home-tools");
    const medium = declarationsInBlock(style, "@media (max-width: 1040px)", ".home-panel");
    expect(medium).toContain("max-width: 48rem");
    expect(medium).toContain('"stats tools"');
    expect(medium).toContain('"play secondary"');
    const narrow = declarationsInBlock(style, "@media (max-width: 720px)", ".home-panel");
    expect(narrow).toContain("max-width: 24rem");
    expect(narrow).toContain('"stats tools"');
    expect(narrow).toContain('"play play"');
    const highFont = declarationsInBlock(style, "@container (max-width: 20rem)", ".home-panel");
    expect(highFont).toContain('"stats"');
    expect(highFont).toContain('"tools"');
    expect(highFont).toContain('"secondary"');
  });
  it("移动端游戏顶栏收窄并让四个统计/操作槽位等宽对称", () => {
    const gameTop = declarations(style, ".game-top");
    expect(gameTop).toContain("padding: max(0.625rem, env(safe-area-inset-top) + 0.25rem) 1.75rem");
    const topActions = declarations(style, ".top-actions");
    expect(topActions).toContain("grid-template-areas");
    const narrow = blockBodies(style, "@media (max-width: 600px), (max-height: 620px)")[0] ?? "";
    expect(narrow).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(narrow).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(optionalDeclarations(narrow, ".game-top")).toBe("");
    expect(narrow).not.toContain("width: clamp(");
    const phoneBlocks = blockBodies(style, "@media (max-width: 600px)");
    expect(phoneBlocks).toHaveLength(1);
    const phone = declarationsInBlock(style, "@media (max-width: 600px)", ".game-top");
    expect(phone).toContain("width: clamp(min(92vw, 294px), 79vw, 480px)");
    expect(phone).toContain("padding-inline: 0");
    expect(declarations(style, ".game-sound")).toContain("font-size: 1.25rem");
    expect(declarations(style, ".restart")).toContain("font-size: 1.5rem");
  });
  it("非首页的玻璃扁平控件仍保留 3:1 边界环", () => {
    expect(style).toMatch(
      /\.tab-btn\.active,\s*\.tab-btn\[aria-pressed="true"\]\s*\{[^}]*0 0 0 1px var\(--glass-boundary\)/,
    );
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

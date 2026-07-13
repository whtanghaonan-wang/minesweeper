import { expect, test, type Page } from "@playwright/test";

type Rect = { x: number; y: number; width: number; height: number };

const EPSILON = 1;
const HOME_CONTENT = [
  ".home-liquid-selection",
  ".home-stats",
  ".home-stats > span",
  ".home-tools",
  ".home-tools > button",
  ".home-bar",
  ".home-play",
  ".home-secondary-actions",
  ".home-secondary-actions > button",
] as const;

const HOME_TARGETS = [
  ".home-play",
  ".home-select",
  ".home-endless",
  ".sound-btn",
  ".transparency-btn",
] as const;

function expectInside(inner: Rect, outer: Rect): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - EPSILON);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - EPSILON);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + EPSILON);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + EPSILON);
}

function rectanglesOverlap(a: Rect, b: Rect): boolean {
  return a.x + a.width > b.x + EPSILON
    && b.x + b.width > a.x + EPSILON
    && a.y + a.height > b.y + EPSILON
    && b.y + b.height > a.y + EPSILON;
}

async function boxesFor(page: Page, selector: string): Promise<Rect[]> {
  const locator = page.locator(selector);
  const boxes: Rect[] = [];
  for (let index = 0; index < await locator.count(); index += 1) {
    boxes.push((await locator.nth(index).boundingBox())!);
  }
  return boxes;
}

async function expectHomeContentInsidePanel(page: Page): Promise<void> {
  const panel = (await page.locator(".home-panel").boundingBox())!;
  for (const selector of HOME_CONTENT) {
    for (const box of await boxesFor(page, selector)) expectInside(box, panel);
  }
}

async function expectStatsAndToolsSeparate(page: Page): Promise<void> {
  const stats = await boxesFor(page, ".home-stats > span");
  const tools = await boxesFor(page, ".home-tools > button");
  for (const stat of stats) {
    for (const tool of tools) expect(rectanglesOverlap(stat, tool)).toBe(false);
  }
}

async function expectTouchTargets(page: Page): Promise<void> {
  const buttons = page.locator(".home-panel button");
  await expect(buttons).toHaveCount(5);
  for (let index = 0; index < await buttons.count(); index += 1) {
    const box = await buttons.nth(index).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}

async function dragHomeLiquid(
  page: Page,
  targetSelector: string,
  edge: "left" | "right",
): Promise<void> {
  const liquid = page.locator(".home-liquid-selection");
  let start = { x: 0, y: 0 };
  await expect.poll(async () => {
    const settled = await liquid.evaluate((element) => (
      element.getAnimations().every((animation) => animation.playState === "finished")
    ));
    if (!settled) return false;
    const box = await liquid.boundingBox();
    if (!box) return false;
    start = {
      x: edge === "left" ? box.x + 2 : box.x + box.width - 2,
      y: box.y + box.height / 2,
    };
    return page.evaluate(({ x, y }) => (
      document.elementFromPoint(x, y)?.classList.contains("home-liquid-selection") ?? false
    ), start);
  }, { message: `${edge} lobe edge should become exposed` }).toBe(true);

  const target = await page.locator(targetSelector).boundingBox();
  expect(target).not.toBeNull();

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 14 },
  );
  await page.mouse.up();
  await expect(page.locator(targetSelector)).toHaveClass(/is-home-selected/);
}

async function expectLowWideHomePanel(page: Page, width: number): Promise<Rect> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  const panel = (await page.locator(".home-panel").boundingBox())!;
  expect(panel.width / panel.height, `${width}px panel=${JSON.stringify(panel)}`)
    .toBeGreaterThan(3.5);
  expect(panel.height, `${width}px panel=${JSON.stringify(panel)}`).toBeLessThan(190);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px scrollWidth`)
    .toBe(width);
  await expectHomeContentInsidePanel(page);
  await expectTouchTargets(page);
  return panel;
}

async function openGame(page: Page, width: number, height = 844): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.locator(".home-play").click();
  await expect(page.locator(".top-actions")).toBeVisible();
}

async function expectGameTopGeometry(page: Page, width: number, height = 844): Promise<{
  top: Rect;
  title: Rect;
  stats: Rect;
}> {
  await openGame(page, width, height);
  const top = (await page.locator(".top-actions").boundingBox())!;
  const title = (await page.locator(".game-title").boundingBox())!;
  const stats = (await page.locator(".game-stats").boundingBox())!;
  expect(
    rectanglesOverlap(title, stats),
    `${width}x${height} title=${JSON.stringify(title)} stats=${JSON.stringify(stats)}`,
  ).toBe(false);
  for (const content of await boxesFor(page, ".game-title > *")) {
    expect(
      rectanglesOverlap(content, stats),
      `${width}x${height} title content=${JSON.stringify(content)} stats=${JSON.stringify(stats)}`,
    ).toBe(false);
  }
  expectInside(top, { x: 0, y: 0, width, height });
  expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px scrollWidth`)
    .toBe(width);
  return { top, title, stats };
}

async function expectGameSlotsTouchable(page: Page): Promise<Rect[]> {
  const slots = await boxesFor(page, ".game-stats > *");
  expect(slots).toHaveLength(4);
  for (const slot of slots) {
    expect(slot.width).toBeGreaterThanOrEqual(44);
    expect(slot.height).toBeGreaterThanOrEqual(44);
  }
  return slots;
}

test("桌面首页是低矮横向胶囊且版本号在表面外", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const panel = page.locator(".home-panel");
  const box = await panel.boundingBox();
  expect(box!.width).toBeGreaterThan(700);
  expect(box!.height).toBeLessThan(160);
  expect(box!.width / box!.height).toBeGreaterThan(4);
  expect(await panel.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("999px");
  await expect(page.locator(".home > .home-ver")).toBeVisible();
});

test("首页只有一团选中玻璃且所有空闲按钮透明", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const panel = page.locator(".home-panel");
  const liquid = page.locator(".home-liquid-selection");
  await expect(page.locator("[data-liquid-glass]")).toHaveCount(1);
  await expect(liquid).toHaveCount(1);
  await expect(page.locator(".home-play")).toHaveClass(/is-home-selected/);

  for (const selector of HOME_TARGETS) {
    const style = await page.locator(selector).evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        backgroundColor: computed.backgroundColor,
        borderTopWidth: computed.borderTopWidth,
      };
    });
    expect(style.backgroundColor, selector).toBe("rgba(0, 0, 0, 0)");
    expect(style.borderTopWidth, selector).toBe("0px");
  }

  const panelBox = await panel.boundingBox();
  const liquidBox = await liquid.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(liquidBox).not.toBeNull();
  expectInside(liquidBox!, panelBox!);
  const opacity = await liquid.evaluate((element) => Number(getComputedStyle(element).opacity));
  expect(opacity).toBeGreaterThan(0);
});

test("默认开始按钮可单击且已选中的即时按钮可重复执行", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".home-play").click();
  await expect(page.locator(".top-actions")).toBeVisible();

  await page.goto("/");
  const sound = page.locator(".sound-btn");
  const originalLabel = await sound.getAttribute("aria-label");
  await sound.click();
  await expect(sound).toHaveClass(/is-home-selected/);
  await expect(sound).not.toHaveAttribute("aria-label", originalLabel!);
  await sound.click();
  await expect(sound).toHaveAttribute("aria-label", originalLabel!);
  await expect(sound).toHaveClass(/is-home-selected/);
});

test("小胶囊边缘可连续拖拽 20 次且不会残留拖拽状态", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const sound = page.locator(".sound-btn");
  const transparency = page.locator(".transparency-btn");

  for (let index = 0; index < 20; index += 1) {
    const isSound = index % 2 === 0;
    const target = isSound ? sound : transparency;
    const stateAttribute = isSound ? "aria-label" : "aria-pressed";
    const before = await target.getAttribute(stateAttribute);
    await dragHomeLiquid(
      page,
      isSound ? ".sound-btn" : ".transparency-btn",
      isSound ? "left" : "right",
    );
    await expect(target).not.toHaveAttribute(stateAttribute, before!);
    await expect(page.locator(".home-panel")).not.toHaveClass(/is-home-liquid-dragging/);
    await expect(page.locator(".is-home-candidate")).toHaveCount(0);
  }
});

test("lostpointercapture 后的新 pointerId 仍能拖拽", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const play = await page.locator(".home-play").boundingBox();
  const sound = await page.locator(".sound-btn").boundingBox();
  expect(play).not.toBeNull();
  expect(sound).not.toBeNull();

  await page.locator(".home-play").dispatchEvent("pointerdown", {
    pointerId: 71,
    pointerType: "touch",
    isPrimary: true,
    clientX: play!.x + play!.width / 2,
    clientY: play!.y + play!.height / 2,
  });
  await page.locator(".home-panel").dispatchEvent("lostpointercapture", {
    pointerId: 71,
    pointerType: "touch",
    isPrimary: true,
  });
  await page.locator(".home-play").dispatchEvent("pointerdown", {
    pointerId: 72,
    pointerType: "touch",
    isPrimary: true,
    clientX: play!.x + play!.width / 2,
    clientY: play!.y + play!.height / 2,
  });
  await page.locator("body").dispatchEvent("pointermove", {
    pointerId: 72,
    pointerType: "touch",
    isPrimary: true,
    clientX: sound!.x + sound!.width / 2,
    clientY: sound!.y + sound!.height / 2,
  });
  await page.locator("body").dispatchEvent("pointerup", {
    pointerId: 72,
    pointerType: "touch",
    isPrimary: true,
    clientX: sound!.x + sound!.width / 2,
    clientY: sound!.y + sound!.height / 2,
  });

  await expect(page.locator(".sound-btn")).toHaveClass(/is-home-selected/);
  await expect(page.locator(".home-panel")).not.toHaveClass(/is-home-liquid-dragging/);
  await expect(page.locator(".is-home-candidate")).toHaveCount(0);
});

test("390px 首页完整可触控且不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const buttons = page.locator(".home-panel button");
  for (let index = 0; index < await buttons.count(); index += 1) {
    const box = await buttons.nth(index).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const stats = (await page.locator(".home-stats").boundingBox())!;
  const tools = (await page.locator(".home-tools").boundingBox())!;
  expect(
    stats.y < tools.y + tools.height && tools.y < stats.y + stats.height,
    `stats=${JSON.stringify(stats)} tools=${JSON.stringify(tools)}`,
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("390px 游戏顶栏收窄、四槽等宽且使用 14px 轻玻璃", async ({ page }) => {
  await openGame(page, 390);
  const topActions = page.locator(".top-actions");
  const topBox = (await topActions.boundingBox())!;
  expect(topBox.width).toBeGreaterThanOrEqual(302);
  expect(topBox.width).toBeLessThanOrEqual(314);

  const slots = await expectGameSlotsTouchable(page);
  const slotWidths = slots.map(({ width }) => width);
  expect(Math.max(...slotWidths) - Math.min(...slotWidths)).toBeLessThan(1);

  const back = (await page.getByRole("button", { name: "返回选关" }).boundingBox())!;
  expect(back.width).toBeGreaterThanOrEqual(44);
  expect(back.height).toBeGreaterThanOrEqual(44);
  const filters = await topActions.evaluate((element) => {
    const computed = getComputedStyle(element);
    return `${computed.backdropFilter} ${computed.getPropertyValue("-webkit-backdrop-filter")}`;
  });
  expect(filters.toLowerCase()).toContain("blur(14px)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("320px 游戏顶栏不溢出且四槽保持 44px 可触控", async ({ page }) => {
  await openGame(page, 320);
  const topBox = (await page.locator(".top-actions").boundingBox())!;
  expect(topBox.x).toBeGreaterThanOrEqual(0);
  expect(topBox.x + topBox.width).toBeLessThanOrEqual(320 + EPSILON);
  await expectGameSlotsTouchable(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("420/421 与 600/601px 游戏顶栏平滑过渡且内容不重叠", async ({ page }) => {
  const geometries = new Map<number, Awaited<ReturnType<typeof expectGameTopGeometry>>>();
  for (const width of [420, 421, 600, 601]) {
    geometries.set(width, await expectGameTopGeometry(page, width));
  }
  expect(Math.abs(geometries.get(420)!.top.width - geometries.get(421)!.top.width))
    .toBeLessThan(3);
  expect(Math.abs(geometries.get(600)!.top.width - geometries.get(601)!.top.width))
    .toBeLessThan(48);
});

test("1024x600 短桌面保持双行顶栏且标题和统计栏不重叠", async ({ page }) => {
  await expectGameTopGeometry(page, 1024, 600);
});

test("721–1040px 首页保持低矮宽胶囊且内容完整可触控", async ({ page }) => {
  for (const width of [721, 768, 900, 1024, 1040]) await expectLowWideHomePanel(page, width);
});

test("720/721px 只切换布局层级且两侧都不溢出", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");
  await expectHomeContentInsidePanel(page);
  await expectTouchTargets(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(720);

  await expectLowWideHomePanel(page, 721);
});

test("1040/1041px 均为低矮宽胶囊且断点前后尺寸平稳", async ({ page }) => {
  const below = await expectLowWideHomePanel(page, 1040);
  const above = await expectLowWideHomePanel(page, 1041);
  expect(Math.abs(below.width - above.width)).toBeLessThan(above.width * 0.2);
  expect(Math.abs(below.height - above.height)).toBeLessThan(above.height * 0.6);
});

for (const width of [320, 360, 361, 370, 390, 420]) {
  test(`${width}px 且 200% 根字号时内容不重叠、不溢出且可触控`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const stats = (await page.locator(".home-stats").boundingBox())!;
    expect(stats.width).toBeGreaterThan(0);
    await expectHomeContentInsidePanel(page);
    await expectStatsAndToolsSeparate(page);
    await expectTouchTargets(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

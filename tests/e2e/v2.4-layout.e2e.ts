import { expect, test, type Page } from "@playwright/test";

type Rect = { x: number; y: number; width: number; height: number };

const EPSILON = 1;
const HOME_CONTENT = [
  ".home-stats",
  ".home-stats > span",
  ".home-tools",
  ".home-tools > button",
  ".home-bar",
  ".home-play",
  ".home-secondary-actions",
  ".home-secondary-actions > button",
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

test("390px 首页完整可触控且不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const buttons = page.locator(".home-panel button");
  for (let index = 0; index < await buttons.count(); index += 1) {
    const box = await buttons.nth(index).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
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

test("721–1024px 首页分区均位于胶囊内且不横向溢出", async ({ page }) => {
  for (const width of [721, 768, 900, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px scrollWidth`)
      .toBe(width);
    await expectHomeContentInsidePanel(page);
  }
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

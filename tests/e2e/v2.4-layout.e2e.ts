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

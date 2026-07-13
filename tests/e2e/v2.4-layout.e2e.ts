import { expect, test } from "@playwright/test";

type Rect = { x: number; y: number; width: number; height: number };

const EPSILON = 1;
const HOME_REGIONS = [
  ".home-stats",
  ".home-tools",
  ".home-bar",
  ".home-play",
  ".home-secondary-actions",
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

async function expectHomeRegionsInsidePanel(page: import("@playwright/test").Page): Promise<void> {
  const panel = (await page.locator(".home-panel").boundingBox())!;
  for (const selector of HOME_REGIONS) {
    const region = (await page.locator(selector).boundingBox())!;
    expectInside(region, panel);
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
    await expectHomeRegionsInsidePanel(page);
  }
});

test("320px 且 200% 根字号时核心功能仍可触控且不溢出", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const buttons = page.locator(".home-panel button");
  await expect(buttons).toHaveCount(5);
  for (let index = 0; index < await buttons.count(); index += 1) {
    const box = await buttons.nth(index).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const stats = (await page.locator(".home-stats").boundingBox())!;
  const tools = (await page.locator(".home-tools").boundingBox())!;
  expect(stats.width).toBeGreaterThan(0);
  expect(rectanglesOverlap(stats, tools)).toBe(false);
  await expectHomeRegionsInsidePanel(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

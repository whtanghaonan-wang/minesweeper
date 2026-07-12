import { expect, test } from "@playwright/test";

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
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

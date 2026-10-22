import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const save = {
  version: 3, unlockedLevel: 11,
  bestTimes: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 256])),
  soundOn: true, endless: { streak: 0, bestStreak: 0 },
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(data => {
    localStorage.setItem("minesweeper-save-v3", JSON.stringify(data));
    localStorage.setItem("minesweeper-ui-prefs-v1", JSON.stringify({ largeBoardHintSeen: true, reducedTransparency: false }));
  }, save);
});

async function expectUsable(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  for (const button of await page.locator('button:not(.cell):visible').all()) {
    const box = await button.boundingBox();
    expect(box, await button.getAttribute('aria-label') ?? await button.innerText()).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth) + 1);
  }
}

for (const [width, height] of [[320,568], [390,844], [600,844], [844,390], [1024,600], [1440,900]]) {
  test(`${width}×${height} 首页与游戏控件完整且棋盘保留可用空间`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.home-vine')).toBeVisible();
    await expect.poll(() => page.locator('.home-vine').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expectUsable(page);
    await expect(page.locator('.home-play')).toContainText('第 11 关');
    await expect(page.locator('.home-endless')).toBeDisabled();
    await expect(page.locator('.home-panel .home-tools')).toHaveCount(0);
    const screenshotDir = `artifacts/ui/${testInfo.project.name}`;
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: `${screenshotDir}/home-${width}.png`, fullPage: true });
    await page.locator('.home-play').click();
    await expect(page.locator('.game-title')).toContainText('第 11 关');
    await expect(page.locator('.time-stat')).toContainText('7:30');
    await expectUsable(page);
    const top = (await page.locator('.game-top').boundingBox())!;
    const bottom = (await page.locator('.game-bottom').boundingBox())!;
    expect(bottom.y - top.y - top.height).toBeGreaterThan(80);
    const title = (await page.locator('.game-title').boundingBox())!;
    const utilities = (await page.locator('.game-utilities').boundingBox())!;
    expect(title.x + title.width).toBeLessThanOrEqual(utilities.x + 1);
    const mode = (await page.locator('.mode-toggle').boundingBox())!;
    const view = (await page.locator('.view-controls').boundingBox())!;
    expect(mode.x + mode.width <= view.x + 1 || mode.y + mode.height <= view.y + 1).toBe(true);
    const fit = page.getByRole('button', { name: '适合屏幕', exact: true });
    await fit.click();
    await expect(fit).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => {
      const board = (await page.locator('.board').boundingBox())!;
      return board.y >= top.y + top.height - 1 && board.y + board.height <= bottom.y + 1;
    }, { message: '完整棋盘应在上下工具栏之间稳定显示' }).toBe(true);
    await expect(page.getByRole('gridcell')).toHaveCount(308);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `${screenshotDir}/game-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}

test('桌面鼠标左键执行所选模式，右键保留快捷插旗', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('.home-play').click();
  await page.getByRole('button', { name: '插旗', exact: true }).click();
  const first = page.getByRole('gridcell').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-label', /已插旗/);
  await expect(page.locator('.cell.open')).toHaveCount(0);
  await expect(page.locator('.mine-stat')).toHaveAttribute('aria-label', '剩余雷数 57');
  await first.click({ button: 'right' });
  await expect(first).toHaveAttribute('aria-label', /未揭开/);
  await page.getByRole('button', { name: '挖开', exact: true }).click();
  await page.getByRole('gridcell').last().click();
  await expect(page.locator('.cell.open').first()).toBeVisible();
});

test('工具即时响应、持久化，且挖开与显示模式独立', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto('/');
  await page.getByRole('button', { name:'关闭音效' }).click();
  await expect(page.getByRole('button', { name:'开启音效' })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minesweeper-save-v3')!).soundOn)).toBe(false);
  await page.getByRole('button', { name:'降低透明度' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-transparency','true');
  await page.locator('.home-play').click();
  await page.getByRole('button', { name:'插旗', exact:true }).click();
  await page.getByRole('button', { name:'放大操作', exact:true }).click();
  await expect(page.getByRole('button', { name:'插旗', exact:true })).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button', { name:'挖开', exact:true })).toHaveAttribute('aria-pressed','false');
  await expect(page.getByRole('button', { name:'放大操作', exact:true })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button', { name:'适合屏幕', exact:true }).click();
  await expect(page.getByRole('button', { name:'插旗', exact:true })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button', { name:'重开', exact:true }).click();
  await expect(page.locator('.time-stat')).toContainText('7:30');
  await expect(page.getByRole('button', { name:'挖开', exact:true })).toHaveAttribute('aria-pressed','true');
});

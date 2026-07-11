import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const save = {
  version: 3,
  unlockedLevel: 50,
  bestTimes: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, 60])),
  soundOn: true,
  endless: { streak: 0, bestStreak: 0 },
};

const browserErrors = new WeakMap<Page, string[]>();
const SUBPIXEL_EPSILON = 0.1;

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.addInitScript((value) => {
    localStorage.setItem("minesweeper-save-v3", JSON.stringify(value));
  }, save);
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

async function openLevel50(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /选关/ }).click();
  await page.getByRole("button", { name: /第 50 关/ }).click();
}

async function finishLevelOneThroughUi(page: Page): Promise<ReturnType<Page["getByRole"]>> {
  await page.goto("/");
  await page.getByRole("button", { name: /选关/ }).click();
  await page.getByRole("button", { name: /^第 1 关，/ }).click();

  const dialog = page.getByRole("dialog");
  const cellCount = await page.getByRole("gridcell").count();
  for (let index = 0; index < cellCount; index++) {
    if (await dialog.isVisible()) return dialog;
    const cell = page.getByRole("gridcell").nth(index);
    await cell.focus();
    await cell.press("Enter");
    try {
      await dialog.waitFor({ state: "visible", timeout: 50 });
      return dialog;
    } catch {
      // 继续按视觉顺序挖掘；真实胜负完成后，主流程会在暂停结束时展示结果。
    }
  }
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  return dialog;
}

test("320×568 的 L50 默认格子可操作且只有一个棋盘 Tab 停点", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openLevel50(page);
  await expect(page.locator(".board-gesture-hint")).toBeVisible();
  const first = page.locator('[role="gridcell"]').first();
  const box = await first.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(23.5);
  expect(box!.height).toBeGreaterThanOrEqual(23.5);
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('[role="gridcell"][tabindex="-1"]')).toHaveCount(1231);
  await page.getByRole("button", { name: /返回选关/ }).click();
  await page.getByRole("button", { name: /第 50 关/ }).click();
  await expect(page.locator(".board-gesture-hint")).toHaveCount(0);
  const reentered = await page.getByRole("gridcell").first().boundingBox();
  expect(reentered!.width).toBeGreaterThanOrEqual(23.5);
});

test("200% 根字号不产生页面横向溢出，非棋盘按钮仍至少 44px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: /选关/ }).click();
  await page.getByRole("button", { name: /第 50 关/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <=
    document.documentElement.clientWidth)).toBe(true);
  for (const button of await page.locator("button:not(.cell)").all()) {
    const box = await button.boundingBox();
    if (box) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
});

test("纵横屏重排保持逻辑焦点", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLevel50(page);
  const active = page.locator('[role="gridcell"][tabindex="0"]');
  await active.press("ArrowRight");
  await active.press("f");
  const logical = await active.getAttribute("data-logical-index");
  const before = await active.boundingBox();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveAttribute(
    "data-logical-index", logical!,
  );
  await expect(page.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "28");
  await expect(page.locator(`[data-logical-index="${logical}"]`)).toContainText("🚩");
  const after = await page.locator(`[data-logical-index="${logical}"]`).boundingBox();
  expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveAttribute(
    "data-logical-index", logical!,
  );
});

test("适合屏幕完整容纳大盘，切回可操作尺寸后可平移", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openLevel50(page);
  await page.getByRole("button", { name: "适合屏幕" }).click();
  const viewport = await page.locator(".board-viewport").boundingBox();
  const board = await page.getByRole("grid").boundingBox();
  expect(board!.x).toBeGreaterThanOrEqual(viewport!.x - 1);
  expect(board!.x + board!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1);
  expect(board!.y).toBeGreaterThanOrEqual(viewport!.y - 1);
  expect(board!.y + board!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);

  await page.getByRole("button", { name: "可操作尺寸" }).click();
  const first = await page.getByRole("gridcell").first().boundingBox();
  expect(first!.width).toBeGreaterThanOrEqual(23.5);
  const transformBefore = await page.getByRole("grid").evaluate((element) => element.style.transform);
  const vp = page.locator(".board-viewport");
  const box = await vp.boundingBox();
  await page.mouse.move(box!.x + 160, box!.y + 284);
  await page.mouse.down();
  await page.mouse.move(box!.x + 100, box!.y + 220, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.getByRole("grid").evaluate((element) => element.style.transform))
    .not.toBe(transformBefore);
});

test("键盘移动把焦点格和焦点环滚入上下栏净空区", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openLevel50(page);
  const active = page.locator('[role=gridcell][tabindex="0"]');
  await active.press("Control+End");
  const cell = await active.boundingBox();
  const viewport = await page.locator(".board-viewport").boundingBox();
  const topBar = await page.locator(".game-top").boundingBox();
  const bottomBar = await page.locator(".game-bottom").boundingBox();
  expect(cell!.x).toBeGreaterThanOrEqual(viewport!.x + 4);
  expect(cell!.x + cell!.width).toBeLessThanOrEqual(
    viewport!.x + viewport!.width - 4 + SUBPIXEL_EPSILON,
  );
  expect(cell!.y).toBeGreaterThanOrEqual(topBar!.y + topBar!.height + 4);
  expect(cell!.y + cell!.height).toBeLessThanOrEqual(bottomBar!.y - 4 + SUBPIXEL_EPSILON);
});

test("结果 dialog 在真实浏览器锁焦点并在 Escape 后解除 inert", async ({ page }) => {
  const dialog = await finishLevelOneThroughUi(page);
  await expect(dialog).toBeVisible();
  await expect(page.locator("#app")).toHaveJSProperty("inert", true);
  const buttons = dialog.getByRole("button");
  await buttons.first().focus();
  await page.keyboard.press("Shift+Tab");
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#app")).toHaveJSProperty("inert", false);
});

test("首页、菜单和游戏无 serious/critical axe 问题", async ({ page }) => {
  await page.goto("/");
  for (const open of [
    async () => {},
    async () => { await page.getByRole("button", { name: /选关/ }).click(); },
    async () => { await page.getByRole("button", { name: /第 50 关/ }).click(); },
  ]) {
    await open();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")))
      .toEqual([]);
  }
  await finishLevelOneThroughUi(page);
  await page.locator(".overlay, .modal").evaluateAll(async (elements) => {
    await Promise.all(elements.flatMap((element) => element.getAnimations())
      .map((animation) => animation.finished.catch(() => undefined)));
  });
  const dialogResult = await new AxeBuilder({ page }).include(".overlay").analyze();
  expect(dialogResult.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")))
    .toEqual([]);
});

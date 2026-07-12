import { chromium } from "@playwright/test";
import { build } from "vite";
import { createServer } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const fixtureRoot = resolve(".pwa-fixtures");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function buildFixture(name) {
  process.env.PWA_TEST_CACHE_ID = `minesweeper-${name}`;
  await build({
    configFile: resolve("vite.config.ts"),
    base: "/",
    build: { outDir: resolve(fixtureRoot, name), emptyOutDir: true },
  });
}

await rm(fixtureRoot, { recursive: true, force: true });
await buildFixture("a");
await buildFixture("b");
delete process.env.PWA_TEST_CACHE_ID;
const [aWorker, bWorker] = await Promise.all([
  readFile(resolve(fixtureRoot, "a", "sw.js")),
  readFile(resolve(fixtureRoot, "b", "sw.js")),
]);
if (aWorker.equals(bWorker)) throw new Error("A/B service workers are byte-identical");

let activeFixture = "a";
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const root = resolve(fixtureRoot, activeFixture);
    let file = resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error("path traversal");
    let body;
    try {
      body = await readFile(file);
    } catch {
      file = resolve(root, "index.html");
      body = await readFile(file);
    }
    response.writeHead(200, {
      "content-type": mime[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
      "service-worker-allowed": "/",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(String(error));
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
if (address === null || typeof address === "string") throw new Error("server did not bind TCP");
const origin = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await context.addInitScript(() => {
    const loads = Number(sessionStorage.getItem("pwaLoads") ?? "0") + 1;
    sessionStorage.setItem("pwaLoads", String(loads));
  });
  const safePage = await context.newPage();
  const gamePage = await context.newPage();
  const errors = [];
  for (const [name, page] of [["safe", safePage], ["game", gamePage]]) {
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${name}: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }
  await safePage.getByRole("button", { name: /选关/ }).click();
  await gamePage.getByRole("button", { name: /开始游戏|继续/ }).click();
  const safeLoadsBeforeWaiting = Number(
    await safePage.evaluate(() => sessionStorage.getItem("pwaLoads")),
  );
  const gameLoadsBeforeWaiting = Number(
    await gamePage.evaluate(() => sessionStorage.getItem("pwaLoads")),
  );

  activeFixture = "b";
  await safePage.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await safePage.waitForFunction(async () =>
    (await navigator.serviceWorker.getRegistration())?.waiting != null,
  );
  await safePage.locator(".pwa-update-prompt").waitFor();
  await gamePage.waitForTimeout(500);
  if (await gamePage.locator(".pwa-update-prompt").count() !== 0) {
    throw new Error("prompt interrupted game");
  }
  if (Number(await gamePage.evaluate(() => sessionStorage.getItem("pwaLoads"))) !==
    gameLoadsBeforeWaiting) {
    throw new Error("page reloaded while game was active");
  }

  await safePage.locator(".pwa-later").click();
  if (await safePage.locator(".pwa-update-prompt").count() !== 0) {
    throw new Error("deferred prompt remained visible");
  }
  await safePage.getByRole("button", { name: /第 1 关/ }).click();
  await safePage.getByRole("button", { name: /返回选关/ }).click();
  await safePage.locator(".pwa-update-prompt").waitFor();

  await safePage.locator(".pwa-now").click();
  await safePage.waitForFunction(
    (expected) => Number(sessionStorage.getItem("pwaLoads")) === expected,
    safeLoadsBeforeWaiting + 1,
  );
  await safePage.waitForTimeout(750);
  const safeLoadsAfterActivation = Number(
    await safePage.evaluate(() => sessionStorage.getItem("pwaLoads")),
  );
  if (safeLoadsAfterActivation !== safeLoadsBeforeWaiting + 1) {
    throw new Error(`safe tab expected one reload, got ${safeLoadsAfterActivation - safeLoadsBeforeWaiting}`);
  }
  if (Number(await gamePage.evaluate(() => sessionStorage.getItem("pwaLoads"))) !==
    gameLoadsBeforeWaiting) {
    throw new Error("activating from safe tab reloaded the active game tab");
  }

  const lifecycle = await safePage.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      waitingIsNull: registration?.waiting === null,
      activeState: registration?.active?.state ?? null,
      cacheKeys: await caches.keys(),
    };
  });
  if (!lifecycle.waitingIsNull) throw new Error("B worker remained waiting after activation");
  if (lifecycle.activeState !== "activated") {
    throw new Error(`B worker active state is ${lifecycle.activeState}`);
  }
  if (!lifecycle.cacheKeys.some((key) => key.includes("minesweeper-b"))) {
    throw new Error(`B cacheId was not activated: ${lifecycle.cacheKeys.join(", ")}`);
  }

  await gamePage.getByRole("button", { name: /返回选关/ }).click();
  await gamePage.locator(".pwa-update-prompt").waitFor();
  if (!(await gamePage.locator(".pwa-update-message").textContent())?.includes("重新载入")) {
    throw new Error("active game tab did not defer reload until a safe route");
  }
  await gamePage.locator(".pwa-now").click();
  await gamePage.waitForFunction(
    (expected) => Number(sessionStorage.getItem("pwaLoads")) === expected,
    gameLoadsBeforeWaiting + 1,
  );
  await gamePage.waitForTimeout(750);
  if (Number(await gamePage.evaluate(() => sessionStorage.getItem("pwaLoads"))) !==
    gameLoadsBeforeWaiting + 1) {
    throw new Error("game tab did not reload exactly once after safe-route confirmation");
  }
  if (errors.length > 0) throw new Error(`console errors: ${errors.join(" | ")}`);

  await safePage.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      await registration.unregister();
    }
    for (const key of await caches.keys()) await caches.delete(key);
  });
  await context.close();
  console.log("PWA A→B prompt update and multi-tab safety passed");
} finally {
  await browser?.close();
  await new Promise((resolveClose, reject) =>
    server.close((error) => error ? reject(error) : resolveClose()),
  );
}

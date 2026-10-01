import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function main() {
  const html = await readFile(resolve(ROOT, "index.html"), "utf8");
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const outDir = resolve(ROOT, "docs", "screens");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });

  await page.screenshot({ path: resolve(outDir, "mobile-plan-top.png") });
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.screenshot({ path: resolve(outDir, "mobile-plan-steps.png") });

  await page.locator('.tab[data-tab="collections"]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(outDir, "mobile-collections.png") });

  await page.locator('.tab[data-tab="plan"]').click();
  const tipStep = page.locator("#plan .item .title.has-tips").first();
  await tipStep.scrollIntoViewIfNeeded();
  await tipStep.click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(outDir, "mobile-tips.png") });

  await page.locator("#menuBtn").click();
  await page.screenshot({ path: resolve(outDir, "mobile-menu.png") });
  await page.locator("#closeMenu").click();

  if (await page.evaluate(() => ((window.__DATA__ && window.__DATA__.maps) || []).length > 0)) {
    await page.locator('.tab[data-tab="map"]').click();
    await page.waitForSelector("#mapCanvas.leaflet-container");
    await page.waitForTimeout(3500);
    await page.screenshot({ path: resolve(outDir, "mobile-map.png") });
    const mk = page.locator("#mapCanvas path.leaflet-interactive").first();
    await mk.click({ force: true });
    await page.waitForTimeout(700);
    await page.screenshot({ path: resolve(outDir, "mobile-map-popup.png") });
  }

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log("Zrzuty zapisane w docs/screens/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

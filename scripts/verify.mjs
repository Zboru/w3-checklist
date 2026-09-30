import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let failures = 0;
function check(name, cond, extra = "") {
  const ok = Boolean(cond);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
}

/** Wyciaga wbudowane dane z index.html bez uruchamiania przegladarki. */
export function extractData(html) {
  const m = html.match(/window\.__DATA__ = ([\s\S]*?);<\/script>/);
  if (!m) throw new Error("Nie znaleziono window.__DATA__ w index.html");
  return JSON.parse(m[1].replace(/<\\\//g, "</"));
}

async function structural() {
  const html = await readFile(resolve(ROOT, "index.html"), "utf8");
  const data = extractData(html);

  const collectionItems = data.collections.flatMap((c) => c.items);
  const planSteps = data.plan.flatMap((c) => c.steps);

  check("12 kategorii IGN", data.collections.length === 12, `jest ${data.collections.length}`);
  check("710 pozycji kolekcji", collectionItems.length === 710, `jest ${collectionItems.length}`);
  check("kazda pozycja kolekcji ma link IGN", collectionItems.every((i) => i.wikiUrl));
  check("plan ma > 100 krokow", planSteps.length > 100, `jest ${planSteps.length}`);
  check("kazdy krok planu ma id i nazwe", planSteps.every((s) => s.id && s.name));
  check("kazdy krok planu ma unikalny tytul niepusty", planSteps.every((s) => s.name.trim().length > 0));
  check("pozycje bez linku nie maja pustego href", collectionItems.every((i) => i.wikiUrl.startsWith("http")));

  const ids = new Set(collectionItems.map((i) => i.id));
  check("ID kolekcji sa spojne (bez pustych)", [...ids].every((id) => id && id !== "k:"));

  const withPl = planSteps.filter((s) => s.namePl).length;
  console.log(`INFO  plan: ${planSteps.length} krokow, ${planSteps.filter((s) => s.wikiUrl).length} z linkiem IGN, ${withPl} z nazwa PL`);
  console.log(`INFO  kolekcje: ${collectionItems.length} pozycji, ${collectionItems.filter((i) => i.namePl).length} z nazwa PL`);
}

async function smoke() {
  const html = await readFile(resolve(ROOT, "index.html"), "utf8");
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "load" });

  // Widok planu
  const planRows = page.locator("#plan .item");
  check("plan sie renderuje (458)", (await planRows.count()) === 458, `${await planRows.count()} wierszy`);
  check("brak bledow JS", errors.length === 0, errors.join("; "));

  // Brak poziomego scrolla
  const scroll = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
  check("brak poziomego scrolla (390px)", scroll.sw <= scroll.cw + 1, `scrollWidth=${scroll.sw}`);

  // Odhaczenie + persystencja po reloadzie
  const first = planRows.first();
  await first.locator('input[type="checkbox"]').check();
  check("wiersz oznaczony jako done", await first.evaluate((el) => el.classList.contains("done")));
  const progressText = await page.locator("#count").textContent();
  check("postep sie zwiekszyl", /^[1-9]/.test(progressText), progressText);

  await page.reload({ waitUntil: "load" });
  const firstAfter = page.locator("#plan .item").first();
  check("postep przetrwal reload", await firstAfter.locator('input[type="checkbox"]').isChecked());

  // Wspoldzielony postep: quest obecny i w planie, i w kolekcjach.
  const sharedId = await page.evaluate(() => {
    const data = window.__DATA__;
    const planIds = new Set(data.plan.flatMap((c) => c.steps.map((s) => s.id)));
    for (const cat of data.collections) {
      for (const it of cat.items) if (planIds.has(it.id)) return it.id;
    }
    return null;
  });
  check("istnieje pozycja wspoldzielona plan/kolekcje", Boolean(sharedId), String(sharedId));

  // Kolekcje
  await page.locator('.tab[data-tab="collections"]').click();
  const colRows = page.locator("#collections .item");
  check("kolekcje sie renderuja (710)", (await colRows.count()) === 710, `${await colRows.count()} wierszy`);

  if (sharedId) {
    const sharedInPlan = page.locator(`#plan .item[data-id="${sharedId}"] input`).first();
    await page.locator('.tab[data-tab="plan"]').click();
    await sharedInPlan.check();
    await page.locator('.tab[data-tab="collections"]').click();
    const sharedInCol = page.locator(`#collections .item[data-id="${sharedId}"] input`).first();
    check("wspoldzielony postep dziala", await sharedInCol.isChecked());
  }

  // Import: wyczysc i wczytaj zapisany stan przez localStorage -> reload
  const saved = await page.evaluate(() => localStorage.getItem("w3checklist.v1"));
  check("stan zapisany w localStorage", saved && saved.includes("\"done\""));

  // Reset przez menu
  await page.locator(".tab[data-tab=\"plan\"]").click();
  await page.locator("#menuBtn").click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#resetBtn").click();
  check("reset czysci stan", (await page.locator("#count").textContent()).startsWith("0/"));

  await browser.close();
  await new Promise((r) => server.close(r));
}

async function main() {
  await structural();
  await smoke();
  console.log(failures === 0 ? "\nWSZYSTKO OK" : `\n${failures} niepowodzen`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Blad weryfikacji:", err.message);
  process.exit(1);
});

import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** Prefiks, pod ktorym symulujemy hosting na GitHub Pages w podkatalogu. */
const PREFIX = "/witcher-checklist/";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8"
};

/** Serwuje katalog builda pod prefiksem (1:1 jak GitHub Pages w podkatalogu). */
function staticServer(root, prefix) {
  return createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!pathname.startsWith(prefix)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    let rel = pathname.slice(prefix.length);
    if (rel === "" || rel.endsWith("/")) rel += "index.html";
    const file = resolve(root, rel);
    if (file !== resolve(root) && !file.startsWith(resolve(root) + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
}

const fileExists = (file) => access(file).then(() => true).catch(() => false);

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

  const maps = data.maps || [];
  if (maps.length) {
    const markers = maps.flatMap((m) => m.markers);
    const linked = markers.filter((m) => m.itemId);
    const extras = markers.filter((m) => !m.itemId);
    const ids = new Set([...planSteps, ...collectionItems].map((i) => i.id));
    check("mapy: 7 regionow", maps.length === 7, `jest ${maps.length}`);
    check("mapy: kazdy region ma URL kafelkow", maps.every((m) => /^https:\/\/tiles\./.test(m.tileUrl || "")));
    check("mapy: znaczniki checklisty maja itemId", linked.length > 300, `${linked.length} powiazanych`);
    check("mapy: znaczniki wskazuja istniejace pozycje", linked.every((m) => ids.has(m.itemId)));
    check("mapy: extra POI maja typ i brak itemId", extras.length > 100 && extras.every((m) => m.taskId == null && m.typeSlug), `${extras.length} extra`);
    check("mapy: kazdy znacznik ma typ", markers.every((m) => m.typeSlug), `${markers.length} znacznikow`);
    check("mapy: wspolrzedne w zakresie", markers.every((m) => Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180));
    const withMap = [...planSteps, ...collectionItems].filter((i) => i.mapUrl).length;
    console.log(`INFO  mapy: ${maps.length} regionow, ${markers.length} znacznikow; pozycji z linkiem do mapy: ${withMap}`);
  } else {
    console.log("INFO  brak map w buildzie (--no-map)");
  }

  /* ---- PWA ---- */
  check("index.html linkuje manifest", /<link[^>]+rel="manifest"[^>]+href="\.\/manifest\.json"/.test(html));
  check("index.html ma apple-touch-icon 180", /rel="apple-touch-icon"[^>]+href="\.\/icons\/apple-touch-180\.png"/.test(html));
  check("index.html ma theme-color #101014", /<meta[^>]+name="theme-color"[^>]+content="#101014"/.test(html));
  check("index.html ma apple-mobile-web-app-capable", /name="apple-mobile-web-app-capable"[^>]+content="yes"/.test(html));
  check("index.html ma apple-mobile-web-app-title", /name="apple-mobile-web-app-title"/.test(html));
  check("index.html ma pasek statusu dla iOS", /name="apple-mobile-web-app-status-bar-style"/.test(html));
  check("index.html rejestruje service worker", /serviceWorker[^\n]*register\(\s*["']\.\/sw\.js["']/.test(html));

  const manifest = JSON.parse(await readFile(resolve(ROOT, "manifest.json"), "utf8").catch(() => "{}"));
  check("manifest: tryb standalone", manifest.display === "standalone");
  check("manifest: start_url i scope względne", manifest.start_url === "./" && manifest.scope === "./");
  check("manifest: ikony 192 i 512", ["192x192", "512x512"].every((s) => (manifest.icons || []).some((i) => i.sizes === s)));
  check("manifest: kolor zgodny z apką", manifest.theme_color === "#101014" && manifest.background_color === "#101014");

  const sw = await readFile(resolve(ROOT, "sw.js"), "utf8").catch(() => "");
  check("sw.js ma handler instalacji", /addEventListener\(\s*["']install["']/.test(sw));
  check("sw.js ma handler fetch", /addEventListener\(\s*["']fetch["']/.test(sw));
  check("sw.js czyści stare cache", /caches\.delete/.test(sw));
  for (const icon of ["icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-180.png"]) {
    check(`ikona istnieje: ${icon}`, await fileExists(resolve(ROOT, icon)));
  }
}

async function smoke() {
  const server = staticServer(ROOT, PREFIX);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}${PREFIX}`;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/*mapgenie.io/**", (r) => r.abort());
  await page.goto(base, { waitUntil: "load" });

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

  // Mapa (jesli build ja zawiera)
  const hasMaps = await page.evaluate(() => ((window.__DATA__ && window.__DATA__.maps) || []).length > 0);
  if (hasMaps) {
    await page.locator('.tab[data-tab="map"]').click();
    await page.waitForSelector("#mapCanvas.leaflet-container", { timeout: 8000 });
    check("zakladka Mapa sie renderuje", (await page.locator("#mapCanvas.leaflet-container").count()) === 1);
    const markerCount = await page.locator("#mapCanvas path.leaflet-interactive").count();
    check("znaczniki na mapie (domyslny region)", markerCount > 5, `${markerCount}`);
    check("regiony jako przelaczniki", (await page.locator("#mapRegions button").count()) === 7);
    check("link 'Na mapie' przy pozycji", (await page.locator('#plan a[data-marker="1"]').count()) > 0);
    check("link 'Mapa' do IGN przy pozycji", (await page.locator('#plan a.link-ign', { hasText: "Mapa" }).count()) > 0);
    const switched = await page.locator("#mapRegions button").nth(2).textContent();
    await page.locator("#mapRegions button").nth(2).click();
    check("przelaczanie regionu", (await page.locator("#mapRegions button.active").textContent()) === switched, switched);

    // filtr typow: przycisk otwiera panel z polskimi nazwami
    check("przycisk Filtry widoczny", await page.locator("#map #mapFilterBtn").isVisible());
    check("panel filtrow zamkniety na start", !(await page.locator("#map #mapFilterPanel").isVisible()));
    await page.locator("#map #mapFilterBtn").click();
    check("przycisk Filtry otwiera panel", await page.locator("#map #mapFilterPanel").isVisible());
    const panelText = await page.locator("#map #mapFilterPanel").textContent();
    check("panel filtrow po polsku", /Miejsce mocy|Drogowskaz|Punkt zainteresowania/.test(panelText), panelText.slice(0, 40));
    const typeToggle = page.locator("#map #mapFilterPanel input:checked").first();
    check("panel ma przelaczniki typow", (await page.locator("#map #mapFilterPanel input").count()) > 0);
    const beforeFilter = await page.locator("#mapCanvas path.leaflet-interactive").count();
    await typeToggle.uncheck();
    const afterFilter = await page.locator("#mapCanvas path.leaflet-interactive").count();
    check("filtr typu ukrywa znaczniki", afterFilter < beforeFilter, `${beforeFilter} -> ${afterFilter}`);
    await typeToggle.check();
    await page.locator("#map #mapFilterPanel button", { hasText: "Żadne" }).click();
    check("skrot Zadne chowa znaczniki", (await page.locator("#mapCanvas path.leaflet-interactive").count()) === 0);
    await page.locator("#map #mapFilterPanel button", { hasText: "Wszystkie" }).click();
    check("skrot Wszystkie przywraca znaczniki", (await page.locator("#mapCanvas path.leaflet-interactive").count()) > 0);

    // integracja: link "Na mapie" przy pozycji otwiera mape ze znacznikiem
    await page.locator('.tab[data-tab="plan"]').click();
    await page.locator('#plan a[data-marker="1"]').first().click();
    await page.waitForSelector("#mapCanvas.leaflet-container");
    await page.waitForTimeout(300);
    check("'Na mapie' otwiera popup na mapie", (await page.locator("#mapCanvas .leaflet-popup").count()) > 0);
    check("brak bledow JS po mapie", errors.length === 0, errors.join("; "));
  } else {
    check("brak zakladki Mapa w buildzie --no-map", await page.locator("#mapTab").isHidden());
  }

  // Reset przez menu
  await page.locator(".tab[data-tab=\"plan\"]").click();
  await page.locator("#menuBtn").click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#resetBtn").click();
  check("reset czysci stan", (await page.locator("#count").textContent()).startsWith("0/"));

  // PWA: rejestracja service workera, cache powloki i dzialanie offline
  const swSupported = await page.evaluate(() => "serviceWorker" in navigator && isSecureContext);
  check("service worker dostepny (secure context)", swSupported);
  if (swSupported) {
    const reg = await page.evaluate(() =>
      Promise.race([
        navigator.serviceWorker.ready.then((r) => (r.active ? "ok" : "no-active")),
        new Promise((res) => setTimeout(() => res("timeout"), 10000))
      ]).catch((e) => "error: " + String(e))
    );
    check("service worker się rejestruje i aktywuje", reg === "ok", String(reg));

    const scope = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
    check("scope = podkatalog apki", scope.endsWith(PREFIX.slice(1)), scope);

    const cached = await page.evaluate(async () => {
      const out = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) out.push(req.url);
      }
      return out;
    });
    check("powłoka apki w cache", cached.includes(base + "index.html"), `${cached.length} wpisów`);
    const foreign = cached.filter((u) => !u.startsWith(base));
    check("obce zasoby poza cache (kafelki mapy)", foreign.length === 0, foreign.join(", "));

    const offlineErrors = [];
    page.on("pageerror", (e) => offlineErrors.push(String(e)));
    await context.setOffline(true);
    await page.reload({ waitUntil: "load", timeout: 15000 });
    const offlineRows = await page.locator("#plan .item").count();
    check("apka otwiera się offline z cache", offlineRows === 458, `${offlineRows} wierszy`);
    check("brak błędów JS offline", offlineErrors.length === 0, offlineErrors.join("; "));
    await context.setOffline(false);
  }

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

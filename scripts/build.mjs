import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { normalizeName, nameVariants, titleFromWikiUrl, buildPlIndex, lookupIndex, lookupPl } from "./lib/names.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WITH_MAP = !process.argv.includes("--no-map");

const read = async (rel) => JSON.parse(await readFile(resolve(ROOT, rel), "utf8"));

/** Wspolny identyfikator pozycji (ten sam quest = ta sama wartosc). */
function keyOf(name) {
  const base = String(name || "").replace(/\s+Complete$/i, "");
  return "k:" + normalizeName(base);
}

/** Indeks dopasowania do stron IGN (URL wiki + URL mapy). */
function buildIgnIndex(categories) {
  const index = new Map();
  const put = (name, value) => {
    if (!name || !value || !value.url) return;
    for (const v of nameVariants(name)) {
      const k = normalizeName(v);
      if (k && !index.has(k)) index.set(k, value);
    }
  };
  for (const cat of categories) {
    for (const item of cat.items) {
      const value = { url: item.wikiUrl, mapUrl: item.mapUrl || null };
      put(item.name, value);
      put(titleFromWikiUrl(item.wikiUrl || ""), value);
    }
  }
  return index;
}

function assert(cond, msg) {
  if (!cond) throw new Error("Asercja builda nieudana: " + msg);
}

async function main() {
  const ign = await read("data/ign.json");
  const sheet = await read("data/sheet.json");
  const plRaw = await read("data/pl-names.json");
  const plIndex = buildPlIndex(plRaw.byTitle || {});
  const ignIndex = buildIgnIndex(ign.categories);

  /* ---- plan ---- */
  const plan = [];
  let planSteps = 0;
  let planWithLink = 0;
  let planWithPl = 0;
  for (const chapter of sheet.chapters) {
    const steps = chapter.steps.map((step) => {
      const hit = lookupIndex(step.name, ignIndex);
      const wikiUrl = hit?.url || null;
      const namePl = lookupPl(step.name, plIndex);
      if (wikiUrl) planWithLink++;
      if (namePl) planWithPl++;
      planSteps++;
      return {
        id: keyOf(step.name),
        name: step.name,
        namePl,
        level: step.level,
        tips: step.tips,
        nonMissable: step.nonMissable,
        wikiUrl,
        mapUrl: hit?.mapUrl || null
      };
    });
    plan.push({ region: chapter.region, steps });
  }

  /* ---- kolekcje ---- */
  let collections = ign.categories.map((cat) => ({
    slug: cat.slug,
    name: cat.name,
    category: cat.category,
    groups: cat.groups,
    items: cat.items.map((item) => ({
      id: keyOf(item.name),
      name: item.name.replace(/\s+Complete$/i, ""),
      namePl: lookupPl(item.name, plIndex) || lookupPl(titleFromWikiUrl(item.wikiUrl || ""), plIndex),
      wikiUrl: item.wikiUrl,
      mapUrl: item.mapUrl || null,
      groupId: item.groupId
    }))
  }));
  for (const cat of collections) {
    for (const group of cat.groups) {
      group.used = cat.items.some((it) => (it.groupId ?? null) === group.id);
    }
    cat.groups = cat.groups.filter((g) => g.used);
    for (const g of cat.groups) delete g.used;
  }

  /* ---- asercje ---- */
  assert(ign.categories.length === 12, `kategorii IGN = 12 (jest ${ign.categories.length})`);
  const collectionItems = collections.flatMap((c) => c.items);
  assert(collectionItems.length === 710, `pozycji kolekcji = 710 (jest ${collectionItems.length})`);
  assert(collectionItems.every((it) => it.wikiUrl), "kazda pozycja kolekcji ma link IGN");
  assert(planSteps > 100, `krokow planu > 100 (jest ${planSteps})`);
  assert(plan.every((c) => c.steps.every((s) => s.id && s.name)), "kazdy krok planu ma id i nazwe");

  /* ---- mapy (opcjonalne, --no-map pomija) ---- */
  let maps = [];
  if (WITH_MAP) {
    try {
      const raw = await read("data/maps.json");
      const taskToId = new Map();
      for (const cat of ign.categories) {
        for (const item of cat.items) taskToId.set(String(item.id), keyOf(item.name));
      }
      maps = (raw.maps || [])
        .map((mp) => ({
          ...mp,
          markers: mp.markers
            .map((mk) => ({ ...mk, itemId: mk.taskId != null ? taskToId.get(String(mk.taskId)) || null : null }))
            .filter((mk) => mk.itemId || mk.taskId == null)
        }))
        .filter((mp) => mp.tileUrl && mp.markers.length);

      const order = ["white-orchard", "velen-novigrad", "skellige-isles", "kaer-morhen", "vizima-palace", "toussaint", "fablesphere"];
      maps.sort((a, b) => {
        const ia = order.indexOf(a.slug);
        const ib = order.indexOf(b.slug);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    } catch {
      maps = [];
    }
    console.log(`Mapy: ${maps.length} regionow, ${maps.reduce((n, m) => n + m.markers.length, 0)} znacznikow`);
  } else {
    console.log("Mapy: pominiete (--no-map)");
  }

  const data = {
    generatedAt: new Date().toISOString(),
    counts: { planSteps, collectionItems: collectionItems.length, maps: maps.length, markers: maps.reduce((n, m) => n + m.markers.length, 0) },
    plan,
    collections,
    maps
  };

  /* ---- bundle JS ---- */
  const built = await build({
    entryPoints: [resolve(ROOT, "src", "app.js")],
    bundle: true,
    format: "iife",
    target: ["es2020"],
    minify: true,
    write: false,
    legalComments: "none",
    ...(WITH_MAP ? {} : { alias: { leaflet: resolve(ROOT, "src", "leaflet-stub.js") } })
  });
  const js = built.outputFiles[0].text;
  let css = await readFile(resolve(ROOT, "src", "styles.css"), "utf8");
  if (WITH_MAP) {
    const leafletCss = await readFile(resolve(ROOT, "node_modules", "leaflet", "dist", "leaflet.css"), "utf8");
    css = leafletCss + "\n" + css;
  }
  const template = await readFile(resolve(ROOT, "src", "template.html"), "utf8");

  const safeJson = JSON.stringify(data).replace(/<\//g, "<\\/");
  const safeJs = js.replace(/<\/script/gi, "<\\/script");

  const html = template
    .replace("/*__CSS__*/", () => css)
    .replace("/*__DATA__*/", () => safeJson)
    .replace("/*__JS__*/", () => safeJs);

  const outFile = resolve(ROOT, "index.html");
  await writeFile(outFile, html, "utf8");

  const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
  console.log(`Plan: ${plan.length} rozdzialow, ${planSteps} krokow (${planWithLink} z linkiem IGN, ${planWithPl} z PL)`);
  console.log(`Kolekcje: ${collections.length} kategorii, ${collectionItems.length} pozycji`);
  console.log(`index.html: ${kb} kB`);
}

main().catch((err) => {
  console.error("Blad builda:", err.message);
  process.exit(1);
});

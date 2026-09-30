import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { titleFromWikiUrl } from "./lib/names.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const EN_API = "https://witcher.fandom.com/api.php";
const PL_API = "https://wiedzmin.fandom.com/api.php";
const BATCH = 45;

// Kategorie polskiej wiki z zadaniami/przedmiotami (baza + dodatki).
const PL_CATEGORIES = [
  "Zadania główne w grze Wiedźmin 3",
  "Zadania poboczne w grze Wiedźmin 3",
  "Zadania główne w Sercach z Kamienia",
  "Zadania poboczne w Sercach z Kamienia",
  "Zadania główne w Krwi i Winie",
  "Zadania poboczne w Krwi i Winie",
  "Zlecenia w grze Wiedźmin 3",
  "Gwint - zadania",
  "Karty do gwinta",
  "Karty do gwinta z talii Cesarstwa Nilfgaardu",
  "Karty do gwinta z talii Królestw Północy",
  "Karty do gwinta z talii Scoia'tael",
  "Karty neutralne do gwinta",
  "Miecze w grze Wiedźmin 3",
  "Miecze srebrne w grze Wiedźmin 3",
  "Miecze stalowe w grze Wiedźmin 3",
  "Zbroje w grze Wiedźmin 3",
  "Przedmioty w grze Wiedźmin 3"
];

async function api(base, params) {
  const res = await fetch(`${base}?${new URLSearchParams({ format: "json", ...params })}`, {
    headers: { "user-agent": "witcher-checklist/1.0" }
  });
  if (!res.ok) throw new Error(`${base} ${res.status}`);
  return res.json();
}

async function readJson(rel, fallback) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, rel), "utf8"));
  } catch {
    return fallback;
  }
}

function variants(title) {
  const t = String(title || "").trim();
  if (!t) return [];
  const out = new Set([t]);
  const noComplete = t.replace(/\s+Complete$/i, "").trim();
  if (noComplete) out.add(noComplete);
  const noPart = t.replace(/\s+Part\s+\d+$/i, "").trim();
  if (noPart) out.add(noPart);
  out.add(`${t} (quest)`);
  return [...out];
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/** EN -> PL przez langlinks angielskiej wiki. */
async function enToPl(wantedTitles, result) {
  const candToOriginal = new Map();
  for (const t of wantedTitles) {
    for (const c of variants(t)) if (!candToOriginal.has(c)) candToOriginal.set(c, t);
  }
  const candidates = [...candToOriginal.keys()];
  let resolved = 0;

  for (const batch of chunk(candidates, BATCH)) {
    let data;
    try {
      data = await api(EN_API, { action: "query", prop: "langlinks", lllang: "pl", redirects: "1", titles: batch.join("|") });
    } catch (err) {
      console.warn(`  EN batch pominiety: ${err.message}`);
      continue;
    }
    const alias = new Map();
    for (const n of data.query?.normalized || []) alias.set(n.to, n.from);
    for (const r of data.query?.redirects || []) alias.set(r.to, r.from);
    for (const page of Object.values(data.query?.pages || {})) {
      const pl = page.langlinks?.[0]?.["*"];
      if (!pl) continue;
      const original = candToOriginal.get(alias.get(page.title) || page.title);
      if (original && !result[original]) {
        result[original] = pl;
        resolved++;
      }
    }
  }
  return resolved;
}

/** PL -> EN przez langlinks polskiej wiki (odwracamy). */
async function plToEn(result) {
  const plPages = new Set();
  for (const cat of PL_CATEGORIES) {
    try {
      const data = await api(PL_API, { action: "query", list: "categorymembers", cmtitle: `Kategoria:${cat}`, cmlimit: "500", cmnamespace: "0" });
      for (const m of data.query?.categorymembers || []) plPages.add(m.title);
    } catch (err) {
      console.warn(`  PL kategoria "${cat}" pominięta: ${err.message}`);
    }
  }

  let resolved = 0;
  for (const batch of chunk([...plPages], BATCH)) {
    let data;
    try {
      data = await api(PL_API, { action: "query", prop: "langlinks", lllang: "en", redirects: "1", titles: batch.join("|") });
    } catch (err) {
      console.warn(`  PL batch pominiety: ${err.message}`);
      continue;
    }
    for (const page of Object.values(data.query?.pages || {})) {
      const en = page.langlinks?.[0]?.["*"];
      if (en && !result[en]) {
        result[en] = page.title;
        resolved++;
      }
    }
  }
  return { plPages: plPages.size, resolved };
}

async function main() {
  const ign = await readJson("data/ign.json", { categories: [] });
  const sheet = await readJson("data/sheet.json", { chapters: [] });

  const wanted = new Set();
  for (const cat of ign.categories || []) {
    for (const item of cat.items || []) {
      if (item.name) wanted.add(item.name);
      const t = item.wikiUrl ? titleFromWikiUrl(item.wikiUrl) : "";
      if (t) wanted.add(t);
    }
  }
  for (const ch of sheet.chapters || []) {
    for (const step of ch.steps || []) if (step.name) wanted.add(step.name);
  }

  const result = {};
  const a = await enToPl(wanted, result);
  const b = await plToEn(result);

  const overrides = await readJson("data/overrides.json", {});
  Object.assign(result, overrides.pl || {});

  const out = { fetchedAt: new Date().toISOString(), byTitle: result };
  const file = resolve(ROOT, "data", "pl-names.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`Tytulow do tlumaczenia: ${wanted.size}`);
  console.log(`  EN->PL: ${a}`);
  console.log(`  PL->EN: ${b.resolved} (stron PL w kategoriach: ${b.plPages})`);
  console.log(`  razem unikalnych mapowan: ${Object.keys(result).length} -> data/pl-names.json`);
}

main().catch((err) => {
  console.error("Blad pobierania PL:", err.message);
  process.exit(1);
});

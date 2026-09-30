import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/csv.mjs";
import { buildPlan } from "./lib/sheet.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SHEET_ID = "12H5lZC6vLFj0JToLSD2ZE7EcMN6MrmltL9SM_G6EUNU";
const MAIN_GID = "1138839882";

async function main() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${MAIN_GID}`;
  const res = await fetch(url, { headers: { "user-agent": "witcher-checklist/1.0" } });
  if (!res.ok) throw new Error(`Google Sheet ${res.status}`);
  const csv = await res.text();

  const { chapters } = buildPlan(parseCsv(csv));
  const total = chapters.reduce((n, c) => n + c.steps.length, 0);

  // overrides.json (recznie korygowane dopasowanie/podzial) jest opcjonalny
  let overrides = null;
  try {
    overrides = JSON.parse(await readFile(resolve(ROOT, "data", "overrides.json"), "utf8"));
  } catch {
    overrides = null;
  }

  const out = {
    source: url,
    fetchedAt: new Date().toISOString(),
    chapters,
    ...(overrides?.sheet ? { overrides: overrides.sheet } : {})
  };

  const file = resolve(ROOT, "data", "sheet.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`Sheet: ${chapters.length} rozdzialow, ${total} krokow -> data/sheet.json`);
  for (const c of chapters) console.log(`  ${c.region.padEnd(26)} ${c.steps.length}`);
  const withTips = chapters.flatMap((c) => c.steps).filter((s) => s.tips.length > 0).length;
  console.log(`  krokow ze wskazowkami: ${withTips}`);
}

main().catch((err) => {
  console.error("Blad pobierania arkusza:", err.message);
  process.exit(1);
});

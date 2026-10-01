import { extractLevel, titleCaseRegion, normalizeName } from "./names.mjs";

const REGION_MARKER = /OPTIMAL ORDER TO DO ALL THE QUESTS/i;
const NON_MISSABLE_MARKER = /^THE FOLLOWING QUESTS/i;
const REGION_LIKE = /^[A-Z0-9][A-Z0-9 &/'’.\-/]*$/;

/**
 * Kroki planu świadomie pomijane w buildzie: żmudne/opcjonalne pozycje, których
 * nie chcemy w głównej liście. Dopasowanie po znormalizowanej nazwie
 * (`normalizeName` zdejmuje m.in. prefiks "Gwent:").
 */
export const EXCLUDED_PLAN_STEPS = new Set(["collect em all"]);

/**
 * Czy krok planu ma zostać pominięty przy budowie.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isExcludedPlanStep(name) {
  return EXCLUDED_PLAN_STEPS.has(normalizeName(String(name ?? "").trim()));
}

const pad = (row, n) => {
  const out = row.slice();
  while (out.length < n) out.push("");
  return out;
};

/**
 * Zamienia wiersze zakładki "optymalna kolejność" na rozdziały z krokami.
 *
 * Reguły:
 * - Parsowanie zaczyna się po wierszu "OPTIMAL ORDER TO DO ALL THE QUESTS".
 * - Kolumna A: region (WERSALIKI) albo separator "THE FOLLOWING QUESTS...".
 * - Kolumna B: nazwa questu (z opcjonalnym poziomem w nawiasie) => nowy krok.
 * - Kolumna D: kolejne linie wskazówek dopisywane do ostatniego kroku.
 * - Po separatorze kroki dostają flagę `nonMissable`.
 *
 * @param {string[][]} rows
 * @returns {{ chapters: Array<{ region: string, steps: Array<{
 *   id: string, name: string, level: number|null, tips: string[], nonMissable: boolean
 * }> }> }}
 */
export function buildPlan(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let start = -1;
  for (let i = 0; i < list.length; i++) {
    if (REGION_MARKER.test((list[i] || []).join(" "))) {
      start = i;
      break;
    }
  }
  const from = start >= 0 ? start + 1 : 0;

  const chapters = [];
  let current = null;
  let currentRegion = "";
  let nonMissable = false;
  let counter = 0;

  for (let i = from; i < list.length; i++) {
    const [a = "", b = "", , d = ""] = pad(list[i], 4);
    const colA = a.trim();
    const colB = b.trim();
    const colD = d.trim();

    if (NON_MISSABLE_MARKER.test(colA)) {
      nonMissable = true;
      continue;
    }

    if (colA && colA.length <= 48 && REGION_LIKE.test(colA)) {
      currentRegion = titleCaseRegion(colA);
      if (!current || current.region !== currentRegion) {
        current = { region: currentRegion, steps: [] };
        chapters.push(current);
      }
      if (!colB) continue;
    }

    if (colB) {
      if (!current) {
        current = { region: currentRegion || "Inne", steps: [] };
        chapters.push(current);
      }
      const { title, level } = extractLevel(colB);
      current.steps.push({
        id: `p${++counter}`,
        name: title,
        level,
        tips: colD ? [colD] : [],
        nonMissable
      });
      continue;
    }

    if (colD && current && current.steps.length > 0) {
      current.steps[current.steps.length - 1].tips.push(colD);
    }
  }

  return { chapters: chapters.filter((c) => c.steps.length > 0) };
}

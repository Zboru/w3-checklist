/**
 * Czysta logika aplikacji (bez DOM). Współdzielona między przeglądarką
 * (po zbundlowaniu) a testami jednostkowymi.
 */

export const STATE_VERSION = 1;

export function emptyState() {
  return { done: new Set(), notes: {} };
}

/**
 * @param {Set<string>} done
 * @param {Record<string,string>} notes
 * @returns {string}
 */
export function serializeState(done, notes) {
  return JSON.stringify({
    v: STATE_VERSION,
    done: Object.fromEntries([...(done || [])].map((id) => [id, 1])),
    notes: notes || {}
  });
}

/**
 * Bezpiecznie parsuje stan. Uszkodzony JSON, złe typy lub nieznane ID nie
 * powodują wyjątku — zwracany jest pusty (lub częściowo odfiltrowany) stan.
 *
 * @param {string} text
 * @param {Set<string>|null} validIds
 * @returns {{ done: Set<string>, notes: Record<string,string> }}
 */
export function parseState(text, validIds = null) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyState();
  }
  if (!raw || typeof raw !== "object") return emptyState();

  const done = new Set();
  if (raw.done && typeof raw.done === "object") {
    for (const [id, val] of Object.entries(raw.done)) {
      if (!val) continue;
      if (validIds && !validIds.has(id)) continue;
      done.add(id);
    }
  }

  const notes = {};
  if (raw.notes && typeof raw.notes === "object") {
    for (const [id, val] of Object.entries(raw.notes)) {
      if (typeof val !== "string" || val === "") continue;
      if (validIds && !validIds.has(id)) continue;
      notes[id] = val;
    }
  }

  return { done, notes };
}

/**
 * @param {Array<{ id: string }>} items
 * @param {Set<string>} done
 * @returns {{ done: number, total: number, percent: number }}
 */
export function computeProgress(items, done) {
  const list = items || [];
  const total = list.length;
  if (total === 0) return { done: 0, total: 0, percent: 0 };
  const completed = list.filter((i) => done && done.has(i.id)).length;
  return { done: completed, total, percent: Math.round((completed / total) * 100) };
}

export function normalizeQuery(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {Array<{ id: string, name?: string, namePl?: string }>} items
 * @param {{ query?: string, hideDone?: boolean, done?: Set<string> }} opts
 */
export function filterItems(items, opts = {}) {
  const { query = "", hideDone = false, done = new Set() } = opts;
  const q = normalizeQuery(query);
  return (items || []).filter((item) => {
    if (hideDone && done.has(item.id)) return false;
    if (!q) return true;
    const haystack = normalizeQuery(`${item.namePl || ""} ${item.name || ""}`);
    return haystack.includes(q);
  });
}

/**
 * Pierwszy nieodhaczony krok planu.
 *
 * @param {Array<{ region: string, steps: Array<{ id: string }> }>} plan
 * @param {Set<string>} done
 * @returns {{ region: string, step: any, index: number } | null}
 */
export function nextStep(plan, done) {
  let index = 0;
  for (const chapter of plan || []) {
    for (const step of chapter.steps || []) {
      if (!done || !done.has(step.id)) {
        return { region: chapter.region, step, index };
      }
      index++;
    }
  }
  return null;
}

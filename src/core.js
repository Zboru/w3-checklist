/**
 * Czysta logika aplikacji (bez DOM). Współdzielona między przeglądarką
 * (po zbundlowaniu) a testami jednostkowymi.
 */

export const STATE_VERSION = 1;

export function emptyState() {
  return { done: new Set() };
}

/**
 * @param {Set<string>} done
 * @returns {string}
 */
export function serializeState(done) {
  return JSON.stringify({
    v: STATE_VERSION,
    done: Object.fromEntries([...(done || [])].map((id) => [id, 1]))
  });
}

/**
 * Krok „przepadający" to ten, który arkusz oznaczył jawnie jako
 * `nonMissable: false`. Pozycje bez tego pola (kolekcje) nie są oznaczane.
 *
 * @param {{ nonMissable?: boolean }|null|undefined} item
 * @returns {boolean}
 */
export function isMissable(item) {
  return Boolean(item) && item.nonMissable === false;
}

/**
 * Bezpiecznie parsuje stan. Uszkodzony JSON, złe typy lub nieznane ID nie
 * powodują wyjątku — zwracany jest pusty (lub częściowo odfiltrowany) stan.
 *
 * Starsze zapisy z polem `notes` wczytują się bez błędu — pole jest ignorowane.
 *
 * @param {string} text
 * @param {Set<string>|null} validIds
 * @returns {{ done: Set<string> }}
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

  return { done };
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

/* ---------------- mapa: typy znaczników ---------------- */

/** Slug-i typów MapGenie, które dokładamy jako POI/znajdźki (poza checklistą). */
export const MARKER_TYPES = {
  pointOfInterest: "608",
  signpost: "610",
  placeOfPower: "607",
  gwentCard: "641",
  witcherGear: "638",
  hiddenTreasure: "637",
  smugglerCache: "611",
  noticeBoard: "605",
  monsterNest: "604",
  monsterDen: "603",
  guardedTreasure: "598"
};

/** Wszystkie extra typy wchodzące do builda. */
export const EXTRA_TYPES = new Set(Object.values(MARKER_TYPES));

/** Extra typy włączone domyślnie po otwarciu mapy. */
export const DEFAULT_ON_TYPES = new Set([
  MARKER_TYPES.pointOfInterest,
  MARKER_TYPES.signpost,
  MARKER_TYPES.placeOfPower,
  MARKER_TYPES.gwentCard,
  MARKER_TYPES.witcherGear,
  MARKER_TYPES.hiddenTreasure
]);

/**
 * Zbiór typów widocznych domyślnie: każdy typ powiązany z checklistą oraz
 * extra typy z DEFAULT_ON_TYPES.
 *
 * @param {Array<{ itemId?: string|null, typeSlug: string|number }>} markers
 * @param {Set<string>} [defaultOn]
 * @returns {Set<string>}
 */
export function defaultEnabledTypes(markers, defaultOn = DEFAULT_ON_TYPES) {
  const enabled = new Set();
  for (const mk of markers || []) {
    const t = String(mk.typeSlug);
    if (mk.itemId || defaultOn.has(t)) enabled.add(t);
  }
  return enabled;
}

/**
 * @param {{ typeSlug: string|number }} marker
 * @param {Set<string>} enabledTypes
 * @returns {boolean}
 */
export function isMarkerVisible(marker, enabledTypes) {
  return enabledTypes.has(String(marker.typeSlug));
}

/** Polskie nazwy typów znaczników (slug MapGenie -> PL). */
export const MARKER_TYPE_NAMES_PL = {
  598: "Strzeżony skarb",
  603: "Legowisko potwora",
  604: "Gniazdo potworów",
  605: "Tablica ogłoszeń",
  607: "Miejsce mocy",
  608: "Punkt zainteresowania",
  610: "Drogowskaz",
  611: "Schowek przemytnika",
  616: "Kontrakt winiarza",
  617: "Kontrakt",
  632: "Zadanie główne",
  633: "Zadanie poboczne",
  636: "Wyścig konny",
  637: "Ukryty skarb",
  638: "Rynsztunek wiedźmina",
  641: "Karta Gwinta",
  649: "Postać"
};

/**
 * Etykieta typu znacznika po polsku; nieznany typ spada do nazwy angielskiej
 * (albo samego slug-a, gdy brak i jej).
 *
 * @param {string|number} typeSlug
 * @param {string} [fallback]
 * @returns {string}
 */
export function typeLabelPl(typeSlug, fallback) {
  const key = String(typeSlug);
  return MARKER_TYPE_NAMES_PL[key] || fallback || key;
}

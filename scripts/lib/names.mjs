/**
 * Pomocnicze funkcje do nazw questów: ekstrakcja poziomu, normalizacja
 * i dopasowywanie do stron wiki IGN.
 */

const LEVEL_SUFFIX = /\s*\((\d+)\)\s*$/;

/**
 * Rozdziela nazwę questu od sugerowanego poziomu w nawiasie.
 * "Devil by the Well (2)" -> { title: "Devil by the Well", level: 2 }
 * "Gwent: Collect 'em All!" -> { title: "Gwent: Collect 'em All!", level: null }
 *
 * @param {string} name
 * @returns {{ title: string, level: number|null }}
 */
export function extractLevel(name) {
  const value = String(name ?? "").trim();
  const m = value.match(LEVEL_SUFFIX);
  if (!m) return { title: value, level: null };
  const title = value.slice(0, m.index).trim();
  return { title, level: Number(m[1]) };
}

const PREFIX_RE =
  /^(?:contract|scavenger hunt|treasure hunt|hidden treasure|gwent)\s*:\s*/i;

/**
 * Normalizuje nazwę do porównań: usuwa prefiksy kategorii, interpunkcję,
 * wielkość liter i nadmiarowe spacje.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(PREFIX_RE, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dopasowuje nazwę questu do URL-a wiki IGN po znormalizowanej nazwie.
 *
 * @param {string} name
 * @param {Map<string, string>} index
 * @returns {string|null}
 */
export function matchIgnUrl(name, index) {
  if (!index || typeof index.get !== "function") return null;
  return index.get(normalizeName(name)) ?? null;
}

/**
 * Buduje indeks `znormalizowanaNazwa -> url` z listy stron wiki IGN.
 * Tytuł wyciąga z ostatniego segmentu `wikiUrl` (bez kotwicy).
 *
 * @param {Array<{ name: string, wikiUrl: string }>} pages
 * @returns {Map<string, string>}
 */
export function buildIgnIndex(pages) {
  const index = new Map();
  for (const page of pages) {
    if (!page || !page.wikiUrl) continue;
    const title = titleFromWikiUrl(page.wikiUrl);
    if (!title) continue;
    const key = normalizeName(title);
    if (!index.has(key)) index.set(key, page.wikiUrl);
  }
  return index;
}

/**
 * Usuwa kotwicę (#...) z URL-a wiki IGN, żeby link prowadził do początku
 * artykułu, a nie do sekcji-checklisty. Null pozostaje nullem.
 *
 * @param {string|null|undefined} wikiUrl
 * @returns {string|null}
 */
export function wikiArticleUrl(wikiUrl) {
  if (wikiUrl == null) return null;
  return String(wikiUrl).split("#")[0];
}

/**
 * Wyciąga czytelny tytuł z URL-a wiki, np.
 * "/wikis/the-witcher-3-wild-hunt/A_Towerful_of_Mice#x" -> "A Towerful of Mice".
 *
 * @param {string} wikiUrl
 * @returns {string}
 */
export function titleFromWikiUrl(wikiUrl) {
  const withoutHash = wikiArticleUrl(wikiUrl) ?? "";
  const segment = withoutHash.split("/").filter(Boolean).pop() || "";
  return decodeURIComponent(segment).replace(/_/g, " ").trim();
}

const STRIP_RULES = [
  /\s+Complete$/i,
  /\s+Part\s+\d+$/i,
  /\s*\(Part\s+\d+\)$/i,
  /\s*\(Basic\)$/i,
  /\((?:[IVX]+|\d+)\)$/
];

/**
 * Zwraca warianty nazwy do dopasowania PL, iteracyjnie zdejmując sufiksy
 * typu "Complete", "Part N" oraz "(2)"/"(II)".
 *
 * @param {string} name
 * @returns {string[]}
 */
export function nameVariants(name) {
  const base = String(name ?? "").trim();
  if (!base) return [];
  const found = new Set([base]);
  const queue = [base];
  while (queue.length) {
    const cur = queue.shift();
    for (const rule of STRIP_RULES) {
      const next = cur.replace(rule, "").trim();
      if (next && !found.has(next)) {
        found.add(next);
        queue.push(next);
      }
    }
  }
  return [...found];
}

/**
 * Szuka wartości w indeksie `znormalizowanaNazwa -> wartosc`, próbując
 * kolejno wszystkich wariantów nazwy.
 *
 * @param {string} name
 * @param {Map<string, string>} index
 * @returns {string|null}
 */
export function lookupIndex(name, index) {
  for (const variant of nameVariants(name)) {
    const hit = index.get(normalizeName(variant));
    if (hit) return hit;
  }
  return null;
}

/** Alias zachowany dla czytelności w miejscach dotyczących tłumaczeń. */
export const lookupPl = lookupIndex;

/**
 * Buduje indeks `znormalizowanaNazwa -> pl` z mapy tytułów.
 * Każdy tytuł jest rozszerzany o warianty (Complete/Part/numery), żeby
 * zapytania o nazwę podstawową trafiały w zapis z sufiksem i odwrotnie.
 *
 * @param {Record<string, string>} byTitle
 * @returns {Map<string, string>}
 */
export function buildPlIndex(byTitle) {
  const index = new Map();
  for (const [en, pl] of Object.entries(byTitle || {})) {
    for (const variant of nameVariants(en)) {
      const key = normalizeName(variant);
      if (key && !index.has(key)) index.set(key, pl);
    }
  }
  return index;
}

/**
 * Zamienia WERSALIKOWY nagłówek regionu na czytelny tytuł.
 * "NOVIGRAD/OXENFURT" -> "Novigrad/Oxenfurt"
 *
 * @param {string} region
 * @returns {string}
 */
export function titleCaseRegion(region) {
  return String(region)
    .toLowerCase()
    .split(/([ /])/)
    .map((part) => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
    .join("")
    .trim();
}

# Wiedźmin 3 — checklista krok po kroku: plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować jednoplikowy, mobilny artefakt-checklistę Wiedźmina 3 (baza + HoS + BaW), prowadzący liniowo „krok po kroku" i odhaczający postęp, z linkami do IGN.

**Architecture:** Repo z pipeline'em Node (ESM). Skrypty pobierają dane z IGN GraphQL, Google Sheet (CSV) i Fandom API, zapisują je do `data/` (cache), a `build.mjs` scala je z `src/*` do jednego samowystarczalnego `index.html`. Zero zależności runtime; esbuild tylko do bundlowania JS w czasue builda.

**Tech Stack:** Node 24 (ESM, `node:test`), vanilla JS/CSS, esbuild (dev), Playwright (dev, smoke test).

**Spec:** `docs/superpowers/specs/2026-09-30-witcher-3-checklist-design.md`

## Global Constraints

- Node ≥ 24, `"type": "module"`.
- Zero zależności runtime — `index.html` nie może wykonywać żądań sieciowych przy starcie.
- IGN `objectId`: `96dabe93-682c-4d61-9f49-e462af876af2`.
- Oczekiwany komplet kolekcji: 12 kategorii, 710 pozycji, 100% z linkiem IGN.
- Postęp wyłącznie w `localStorage`; brak backendu.
- Mobile-first: brak poziomego scrolla przy 360 px, tap targety ≥ 44 px.
- Nazwy: PL + EN; brak mapowania PL → tylko EN (bez pustych nawiasów).

## Review Focus

- **Uszkodzony / obcy JSON w `localStorage`** (użytkownik wklei cokolwiek) → aplikacja startuje z pustym stanem, nie rzuca wyjątku; test w Task 7.
- **Import pliku z nieznanymi ID** (np. z innej wersji listy) → nieznane ID ignorowane, znane zachowane; test w Task 7.
- **Pozycja bez `wikiUrl`** → brak ikony linku, nie pusty `href="#"`; test w Task 8.
- **Nazwa questa z nawiasem w środku i bez poziomu** (np. `Gwent: Collect 'em All!`) → `level = null`, nie wyjątek; test w Task 2.
- **Puste / brakujące komórki w wierszach arkusza** (krótsze niż 4 kolumny) → parser nie rzuca; test w Task 3.

---

### Task 1: Szkielet projektu + parser CSV

**Files:**
- Create: `package.json`, `.gitignore`
- Create: `scripts/lib/csv.mjs`
- Test: `test/csv.test.mjs`

**Interfaces:**
- Produces: `parseCsv(text: string) => string[][]`

- [ ] **Step 1: Utwórz `package.json`**

```json
{
  "name": "witcher-checklist",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "fetch": "node scripts/fetch-ign.mjs && node scripts/fetch-sheet.mjs && node scripts/fetch-pl.mjs",
    "build": "node scripts/build.mjs",
    "verify": "node scripts/verify.mjs",
    "test": "node --test test/"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "playwright": "^1.63.0"
  }
}
```

- [ ] **Step 2: Napisz test parsera**

```js
// test/csv.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../scripts/lib/csv.mjs";

test("parsuje cytowane pola z przecinkami i nowymi liniami", () => {
  const rows = parseCsv('a,b\n"x,1",\'y\n2\'\n');
  assert.deepEqual(rows, [["a", "b"], ["x,1", "'y\n2'"], [""]]);
});

test("obsługuje podwójne cudzysłowy i krótkie wiersze", () => {
  const rows = parseCsv('"a""b",c\nd\n');
  assert.deepEqual(rows[0], ['a"b', "c"]);
  assert.deepEqual(rows[1], ["d", ""]);
});
```

- [ ] **Step 3: Uruchom test (ma failować)**

Run: `npm test`
Expected: FAIL — `Cannot find module .../csv.mjs`.

- [ ] **Step 4: Zaimplementuj `parseCsv`** (maszyna stanów jak w prototypie: pole w cudzysłowie, `""` → `"`, przecinek/nowa linia jako separatory, `\r` pomijany). Wiersze są zawsze dopełniane do długości 4 w `sheet.mjs`, nie tutaj.

- [ ] **Step 5: Uruchom test**

Run: `npm test`
Expected: PASS (2 testy).

- [ ] **Step 6: `.gitignore`** — `node_modules/`, `index.html`? (Nie: wynik commitujemy, żeby Pages działał bez builda.) Wpisy: `node_modules/`, `*.log`, `.DS_Store`.

- [ ] **Step 7: Commit** — `chore: scaffold + csv parser`.

---

### Task 2: Nazwy, poziomy, dopasowanie

**Files:**
- Create: `scripts/lib/names.mjs`
- Test: `test/names.test.mjs`

**Interfaces:**
- Produces:
  - `extractLevel(name) => { title: string, level: number|null }`
  - `normalizeName(name) => string`
  - `matchIgnUrl(name, index: Map<string,string>) => string|null`

- [ ] **Step 1: Testy**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLevel, normalizeName, matchIgnUrl } from "../scripts/lib/names.mjs";

test("wyciąga poziom z ostatniego nawiasu liczbowego", () => {
  assert.deepEqual(extractLevel("Devil by the Well (2)"), { title: "Devil by the Well", level: 2 });
});
test("brak poziomu => level null i tytuł bez zmian", () => {
  assert.deepEqual(extractLevel("Gwent: Collect 'em All!"), { title: "Gwent: Collect 'em All!", level: null });
});
test("ignoruje nawias nieliczbowy", () => {
  assert.deepEqual(extractLevel("Kaer Morhen (quest)"), { title: "Kaer Morhen (quest)", level: null });
});
test("normalizacja usuwa prefiksy, interpunkcję i wielkość liter", () => {
  assert.equal(normalizeName("Contract: The White Lady"), "the white lady");
  assert.equal(normalizeName("Scavenger Hunt: Griffin School Gear"), "griffin school gear");
  assert.equal(normalizeName("A Towerful of Mice"), "a towerful of mice");
});
test("dopasowanie po znormalizowanej nazwie", () => {
  const idx = new Map([["a towerful of mice", "https://www.ign.com/wikis/the-witcher-3-wild-hunt/A_Towerful_of_Mice"]]);
  assert.equal(matchIgnUrl("A Towerful of Mice", idx), "https://www.ign.com/wikis/the-witcher-3-wild-hunt/A_Towerful_of_Mice");
  assert.equal(matchIgnUrl("Nieznany Quest", idx), null);
});
```

- [ ] **Step 2: Uruchom (fail)** — `npm test`.

- [ ] **Step 3: Zaimplementuj**
  - `extractLevel`: regex `\s*\((\d+)\)\s*$`.
  - `normalizeName`: lowercase, usuń prefiks `^(contract|scavenger hunt|treasure hunt|gwent)\s*:\s*`, usuń interpunkcję `[^a-z0-9 ]`, zwiń spacje.
  - `matchIgnUrl`: `index.get(normalizeName(name)) ?? null`.

- [ ] **Step 4: Uruchom (PASS)** i commit — `feat: name/level helpers`.

---

### Task 3: Arkusz → liniowe kroki

**Files:**
- Create: `scripts/lib/sheet.mjs`
- Test: `test/sheet.test.mjs`

**Interfaces:**
- Consumes: `parseCsv` (Task 1), `extractLevel` (Task 2).
- Produces: `buildPlan(rows: string[][]) => Chapter[]`, gdzie
  `Chapter = { region: string, steps: Step[] }`,
  `Step = { name: string, level: number|null, tips: string[], nonMissable: boolean }`.

- [ ] **Step 1: Testy** — użyj krótkiego, ręcznie zrobionego fragmentu CSV (nagłówki + 2 questy z tipami + separator „THE FOLLOWING QUESTS CAN NEVER BE FAILED" + 1 quest). Asercje:
  - liczba rozdziałów i kroków;
  - `tips` zbiera kolejne linie kolumny D aż do następnego questa;
  - poziom wyciągnięty, nazwa bez `(2)`;
  - kroki po separatorze mają `nonMissable: true`;
  - wiersz krótszy niż 4 kolumny nie rzuca.

- [ ] **Step 2: Uruchom (fail)**.

- [ ] **Step 3: Zaimplementuj `buildPlan`**
  - Iteruj wiersze; pomiń nagłówki (wiersze bez questa i bez tipów, oraz wiersze zawierające „TOTAL QUEST COMPLETION"/„LOCATION,QUEST").
  - Jeśli kolumna B zawiera tekst i pasuje do `^(.*)\s*\((\d+)\)\s*$` lub jest niepusta → nowy krok (`extractLevel`).
  - Region: ostatnia niepusta wartość kolumny A, która nie jest zdaniem (heurystyka: ≤ 32 znaki i wersaliki) i nie jest separatorem.
  - Separator „THE FOLLOWING QUESTS" → `nonMissable = true` dla kolejnych kroków do końca rozdziału.
  - Linie kolumny D dopisuj do `tips` ostatniego kroku (jeśli brak kroku — pomiń).

- [ ] **Step 4: Uruchom (PASS)** i commit — `feat: parse sheet into linear plan`.

---

### Task 4: IGN → data/ign.json

**Files:**
- Create: `scripts/fetch-ign.mjs`
- Output: `data/ign.json`

**Interfaces:**
- Produces: `data/ign.json` zgodny z kontraktem w spec (12 kategorii, 710 pozycji).

- [ ] **Step 1: Zaimplementuj skrypt**
  - Zapytanie `Checklists($objectId)` → lista kategorii.
  - Dla każdej: `Checklist($id)` → `groups` + `tasks` (z `guidePages[].wikiUrl`).
  - URL IGN: prefiks `https://www.ign.com` do `wikiUrl`.
  - Zapisz `data/ign.json` (pretty).
- [ ] **Step 2: Uruchom** `node scripts/fetch-ign.mjs`; sprawdź wypisane liczby (12 / 710).
- [ ] **Step 3: Commit** — `feat: fetch IGN checklists`.

---

### Task 5: Arkusz → data/sheet.json

**Files:**
- Create: `scripts/fetch-sheet.mjs`
- Output: `data/sheet.json`

- [ ] **Step 1: Zaimplementuj** — pobierz CSV `export?format=csv&gid=1138839882`, `parseCsv`, `buildPlan`, zapisz `data/sheet.json`.
- [ ] **Step 2: Uruchom** i sprawdź liczbę rozdziałów/kroków (`> 100`).
- [ ] **Step 3: Commit** — `feat: fetch + parse sheet`.

---

### Task 6: Fandom PL → data/pl-names.json

**Files:**
- Create: `scripts/fetch-pl.mjs`
- Output: `data/pl-names.json`

**Interfaces:**
- Konsumuje: `data/ign.json` (tytuły EN wynikające ze sluga `wikiUrl`), `data/sheet.json` (nazwy questów).
- Produces: `data/pl-names.json` = `{ [englishTitle]: polishTitle }`.

- [ ] **Step 1: Zaimplementuj**
  - Zbierz zestaw tytułów EN: z `wikiUrl` (segment po `/wikis/the-witcher-3-wild-hunt/`, `_`→spacja, usuń `#anchor`) oraz z kroków planu.
  - Batchuj po 50 do `https://witcher.fandom.com/api.php?action=query&prop=langlinks&lllang=pl&format=json&titles=...` (URL-encoded, `|`-separated).
  - Dla każdej strony z `langlinks[0].*` zapisz mapowanie `title → polski`.
  - `data/overrides.json` (ręczne korekty) nadpisuje wynik, jeśli istnieje.
- [ ] **Step 2: Uruchom**, wypisz pokrycie (ile tytułów przetłumaczono / ile brakuje).
- [ ] **Step 3: Commit** — `feat: fetch PL names via fandom interwiki`.

---

### Task 7: Rdzeń logiki przeglądarki + testy

**Files:**
- Create: `src/core.js`
- Test: `test/core.test.mjs`

**Interfaces:**
- Produces (eksporty ESM):
  - `buildState(raw) => { done: Set<string>, notes: Record<string,string> }` (walidacja, tolerancja błędów)
  - `serializeState(state) => string`
  - `parseState(json) => state` (bezpieczny, ignoruje nieznane ID)
  - `computeProgress(items, done) => { done: number, total: number, percent: number }`
  - `filterItems(items, { query, hideDone, done }) => items[]`
  - `nextStep(plan, done) => { region, step } | null`

- [ ] **Step 1: Testy** — pokrywają Review Focus: uszkodzony JSON → pusty stan; import z nieznanym ID → znane zachowane; brak `wikiUrl` nie psuje filtra; `nextStep` pomija rozdziały ukończone.
- [ ] **Step 2: Uruchom (fail)**.
- [ ] **Step 3: Zaimplementuj** (czyste funkcje, bez DOM).
- [ ] **Step 4: Uruchom (PASS)** i commit.

---

### Task 8: UI + build → index.html

**Files:**
- Create: `src/template.html`, `src/app.js`, `src/styles.css`
- Create: `scripts/build.mjs`
- Output: `index.html`

**Interfaces:**
- Consumes: `data/ign.json`, `data/sheet.json`, `data/pl-names.json`, `src/core.js`.
- Produces: `index.html` z `window.__DATA__ = { plan, collections, generatedAt }`.

- [ ] **Step 1: `app.js`** — dwa widoki (zakładki), render planu z rozdziałami i kolekcji z grupami; sticky pasek postępu + „Następny krok →"; checkboxy, notatki, rozwijane wskazówki (spoilery), filtry, szukajka; zapis do `localStorage`; eksport/import; link „udostępnij postęp"; reset.
- [ ] **Step 2: `styles.css`** — mobile-first, zmienne motywu, ciemny motyw, safe-area, tap ≥ 44 px, brak poziomego scrolla.
- [ ] **Step 3: `build.mjs`** — waliduje dane (asercje), scala `sheet.json` + `ign.json` + `pl-names.json` do `plan`/`collections`, bundluje `app.js` (esbuild, format `iife`) wraz z `core.js`, wstawia CSS+JS+dane do `template.html`, zapisuje `index.html`.
- [ ] **Step 4: Uruchom** `node scripts/build.mjs`; sprawdź rozmiar i brak błędów.
- [ ] **Step 5: Commit** — `feat: app UI + build to index.html`.

---

### Task 9: Weryfikacja

**Files:**
- Create: `scripts/verify.mjs`
- Create: `test/verify-structure.test.mjs`

- [ ] **Step 1: Asercje danych** — 12 kategorii, 710 pozycji, 0 bez linku, brak duplikatów ID, plan `> 100` kroków.
- [ ] **Step 2: Smoke Playwright** (390×844, plik lokalny przez `page.setContent` / `goto(file://)`): oba widoki się renderują, odhaczenie → reload → nadal zaznaczone, eksport→import round-trip, `document.documentElement.scrollWidth <= 390`.
- [ ] **Step 3: Uruchom** `npm run verify`; zapisz wynik.
- [ ] **Step 4: Commit** — `test: build assertions + playwright smoke`.

---

### Task 10: README + instrukcja hostingu

**Files:**
- Create: `README.md`

- [ ] **Step 1:** Opisz: co to jest, jak używać (telefon, eksport/import), jak przebudować (`npm run fetch && npm run build`), źródła danych, jak opublikować na GitHub Pages (Settings → Pages → branch `main` / root).
- [ ] **Step 2: Commit** — `docs: README`.

---

## Self-Review

- **Spec coverage:** cel→Task 8; dane→Task 4–6; dwa widoki→Task 8; PL→Task 6; postęp/eksport→Task 7–8; weryfikacja→Task 9; hosting→Task 10. Brak luk.
- **Placeholders:** brak „TODO"; kroki algorytmiczne (parser, `buildPlan`, dopasowanie) mają opis reguł, testy pinują zachowanie.
- **Type consistency:** `Step.name` bez poziomu; `Step.level` osobno; `wikiUrl` dodawane w buildzie; nazwy funkcji spójne między zadaniami.
- **Review Focus:** każdy przypadek ma test w Task 2/3/7/8.

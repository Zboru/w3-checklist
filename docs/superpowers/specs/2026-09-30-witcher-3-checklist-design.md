# Wiedźmin 3 — checklista krok po kroku: specyfikacja

Data: 2026-09-30

## Cel

Artefakt do użytku na telefonie, który prowadzi gracza przez Wiedźmina 3
(baza + Serca z Kamienia + Krew i Wino) w optymalnej kolejności i pozwala
odhaczać postęp, tak aby nie pominąć żadnej treści. Każda pozycja linkuje do
szczegółów w IGN.

## Kryteria sukcesu

- Otwiera się na telefonie (docelowo GitHub Pages; działa też offline).
- Widok domyślny to liniowa, ponumerowana instrukcja „zrób to, potem tamto".
- Komplet pozycji z IGN: 12 kategorii / 710 pozycji, każda z linkiem do IGN.
- Polskie nazwy tam, gdzie da się je zmapować; w przeciwnym razie angielskie.
- Postęp przetrwa reload i da się wyeksportować/zaimportować.
- Brak poziomego przewijania przy szerokości 360 px; tap targety ≥ 44 px.

## Użytkownik i kontekst

Pojedynczy użytkownik (Sebastian) gra po polsku, przegląda listę na telefonie
podczas gry. Nie chce niczego przeoczyć i chce mieć łatwy dostęp do szczegółów.

## Źródła danych

1. **IGN GraphQL** — `https://mollusk.apis.ign.com/graphql` (bez klucza API).
   - `checklists(objectId)` → 12 kategorii z `taskCount`.
   - `checklist(id)` → `groups` oraz `tasks { id, name, guidePages { title, wikiUrl } }`.
   - `objectId` gry: `96dabe93-682c-4d61-9f49-e462af876af2`.
2. **Google Sheet** (optymalna kolejność) — arkusz
   `12H5lZC6vLFj0JToLSD2ZE7EcMN6MrmltL9SM_G6EUNU`, eksport CSV per `gid`.
   - Zakładki: główna kolejność (`1138839882`), Gwent (`1740133352`),
     diagramy sprzętu (`577176305`), alchemia (`2092622714`), trofea (`682610656`),
     challenge run (`1823644349`), extra things (`888412237`), +`114015009`.
   - Kolumny głównej zakładki: A = region/rozdział, B = quest + `(poziom)`,
     D = „extra details" (wielolinijkowe wskazówki do poprzedzającego questa).
3. **Fandom API** (polskie nazwy) — `witcher.fandom.com/api.php` z
   `prop=langlinks&lllang=pl` (mapowanie EN→PL). Fallback: brak mapowania → EN.

### Normalizacja i dopasowanie

- Poziom questa: liczba w ostatnim nawiasie nazwy, np. `Devil by the Well (2)`.
- Powiązanie kroku z IGN: normalizacja nazwy (lowercase, bez interpunkcji,
  bez prefiksów typu `Contract:`/`Scavenger Hunt:`), dopasowanie po nazwie.
  Ręczne korekty w `data/overrides.json`.

## Ustalenia projektowe (zatwierdzone)

- Dwa widoki: **Plan gry** (domyślny, liniowy) i **Kolekcje** (kategorie IGN).
- Polskie nazwy: auto-mapowanie + fallback EN (bez ręcznego uzupełniania questów).
- Hosting: plik gotowy na GitHub Pages + instrukcja w README (bez zakładania repo).

## Architektura

Repozytorium z pipeline'em budującym (Node 24, ESM). Zero zależności runtime.
Wynikiem jest jeden samowystarczalny `index.html` (dane + CSS + JS inline).

```
scripts/
  lib/csv.mjs        parser CSV (RFC4180-ish)
  lib/sheet.mjs      wiersze zakładki → liniowe kroki planu
  lib/names.mjs      normalizacja nazw, ekstrakcja poziomu, dopasowanie do IGN
  fetch-ign.mjs      IGN GraphQL → data/ign.json
  fetch-sheet.mjs    Google Sheet CSV → data/sheet.json
  fetch-pl.mjs       Fandom langlinks → data/pl-names.json
  build.mjs          scala dane + src/* → index.html
  verify.mjs         asercje builda + smoke test
data/                cache (ign.json, sheet.json, pl-names.json, overrides.json)
src/
  template.html      szkielet strony z placeholderami
  app.js             logika aplikacji (importuje core.js)
  core.js            czyste funkcje (filtrowanie, serializacja, dopasowania)
  styles.css         style mobile-first
index.html           wynik (generowany)
test/                testy jednostkowe (node:test)
```

Bundlowanie JS: esbuild (devDependency) składa ESM do jednego IIFE inline.

## Kontrakt danych

`data/ign.json`:
```json
{ "objectId": "...", "categories": [ { "id", "slug", "name", "category",
  "groups": [ { "id", "name" } ],
  "items": [ { "id", "name", "wikiUrl", "groupId" } ] } ] }
```

`data/sheet.json`:
```json
{ "chapters": [ { "id", "region", "steps": [ { "id", "name", "level",
  "tips": ["..."], "index": 1 } ] } ] }
```

`data/pl-names.json`: `{ "English Name": "Polska nazwa" }`

`index.html` osadza scalony `window.__DATA__`:
```json
{ "plan": [ { "region", "steps": [ { "id","name","namePl","level","tips",
  "wikiUrl","nonMissable" } ] } ],
  "collections": [ { "slug","name","category","groups","items" } ],
  "generatedAt": "..." }
```

## Aplikacja (UI)

- **Plan gry**: rozdziały regionów, kroki ponumerowane; sticky nagłówek z
  „Zrobione X/Y" i przyciskiem „Następny krok →"; krok: checkbox, nazwa PL+EN,
  chip poziomu, link IGN, rozwijane „Wskazówki" (spoilery domyślnie ukryte),
  wyróżnienie kroków nieprzepadających.
- **Kolekcje**: kategorie IGN w akordeonach, grupowane (akt/region/talia).
- Wspólne: szukajka PL+EN, filtr „ukryj zrobione"/„tylko niezrobione",
  paski postępu (rozdział/kategoria/całość), własne notatki per pozycja.
- Postęp: `localStorage` (autozapis), eksport/import JSON, link „udostępnij
  postęp" (stan w `#`), reset.
- Dostępność: aria na checkboxach, kontrast, focus, ciemny motyw,
  `env(safe-area-inset-*)`, brak poziomego scrolla.

## Obsługa błędów i przypadki brzegowe

- Brak sieci przy `fetch-*` → czytaj `data/*.json` z cache; brak cache → błąd
  z instrukcją uruchomienia `npm run fetch`.
- Zepsuty/zapisany nadmiarowy stan w `localStorage` → walidacja, fallback do
  pustego stanu (bez wysypywania UI).
- Import niepoprawnego JSON → komunikat, stan bez zmian.
- Pozycje bez mapowania PL → pokazują samą nazwę EN (bez pustych nawiasów).
- Pozycje bez linku IGN → brak ikony linku (nie pusty `href`).
- Duplikaty nazw questów (np. „Gwent: …") → rozłączne ID, brak kolizji stanu.

## Weryfikacja

- Testy jednostkowe (`node --test`): parser CSV, budowa kroków z zakładki,
  ekstrakcja poziomu, normalizacja/dopasowanie nazw, scalanie danych,
  serializacja/deserializacja postępu.
- Asercje builda: 12 kategorii, 710 pozycji, 0 pozycji bez linku, brak
  duplikatów ID, plan ma co najmniej 1 rozdział i >100 kroków.
- Smoke test przeglądarki (Playwright, viewport 390×844): render obu widoków,
  odhaczenie + reload = persystencja, eksport→import round-trip, brak
  poziomego scrolla.
- Kontrola rozmiaru `index.html`.

## Poza zakresem (YAGNI)

- Logowanie, sync między urządzeniami, backend, PWA, wiele języków poza PL/EN.
- Automatyczne odświeżanie danych w runtime (dane są wbudowane w plik).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  serializeState,
  parseState,
  computeProgress,
  filterItems,
  nextStep,
  normalizeQuery,
  isMissable,
  defaultEnabledTypes,
  isMarkerVisible,
  typeLabelPl,
  MARKER_TYPES,
  MARKER_TYPE_NAMES_PL,
  DEFAULT_ON_TYPES
} from "../src/core.js";

const IDS = new Set(["a", "b", "c"]);

test("pusty stan ma pusty zbiór", () => {
  const s = emptyState();
  assert.equal(s.done.size, 0);
});

test("serializacja i deserializacja zachowują stan", () => {
  const done = new Set(["a", "c"]);
  const round = parseState(serializeState(done), IDS);
  assert.deepEqual([...round.done].sort(), ["a", "c"]);
});

test("uszkodzony JSON daje pusty stan zamiast wyjątku", () => {
  const s = parseState("{to nie json", IDS);
  assert.equal(s.done.size, 0);
});

test("nieznane ID są ignorowane, znane zachowane", () => {
  const text = JSON.stringify({ v: 1, done: { a: 1, zombie: 1 } });
  const s = parseState(text, IDS);
  assert.deepEqual([...s.done], ["a"]);
});

test("stary zapis z notatkami wciąż się wczytuje (pole ignorowane)", () => {
  const text = JSON.stringify({ v: 1, done: { a: 1 }, notes: { a: "x", zombie: "y" } });
  const s = parseState(text, IDS);
  assert.deepEqual([...s.done], ["a"]);
  assert.equal("notes" in s, false);
});

test("bez listy znanych ID akceptuje wszystko", () => {
  const text = JSON.stringify({ v: 1, done: { cokolwiek: 1 } });
  assert.equal(parseState(text, null).done.has("cokolwiek"), true);
});

test("isMissable tylko dla kroków jawnie oznaczonych jako przepadające", () => {
  assert.equal(isMissable({ nonMissable: false }), true);
  assert.equal(isMissable({ nonMissable: true }), false);
  assert.equal(isMissable({}), false);
  assert.equal(isMissable(null), false);
});

test("computeProgress liczy procent i obsługuje zero", () => {
  const items = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(computeProgress(items, new Set(["a"])), { done: 1, total: 2, percent: 50 });
  assert.deepEqual(computeProgress([], new Set()), { done: 0, total: 0, percent: 0 });
});

test("filterItems szuka po nazwie i ukrywa zrobione", () => {
  const items = [
    { id: "a", name: "A Towerful of Mice", namePl: "Mysia wieża" },
    { id: "b", name: "Bloody Baron" },
    { id: "c", name: "Carnal Sins" }
  ];
  const done = new Set(["a"]);
  assert.deepEqual(filterItems(items, { query: "mysia", done }).map((i) => i.id), ["a"]);
  assert.deepEqual(filterItems(items, { query: "", hideDone: true, done }).map((i) => i.id), ["b", "c"]);
  assert.deepEqual(filterItems(items, { query: "", done }).length, 3);
});

test("filterItems nie wymaga wikiUrl ani namePl", () => {
  const items = [{ id: "a", name: "X" }];
  assert.equal(filterItems(items, { query: "x", done: new Set() }).length, 1);
});

test("normalizeQuery pomija interpunkcję i wielkość liter", () => {
  assert.equal(normalizeQuery("  Mysia Wieża "), "mysia wieza");
});

test("nextStep pomija ukończone i zwraca pierwszy zaległy", () => {
  const plan = [
    { region: "R1", steps: [{ id: "a" }, { id: "b" }] },
    { region: "R2", steps: [{ id: "c" }] }
  ];
  const n = nextStep(plan, new Set(["a"]));
  assert.equal(n.step.id, "b");
  assert.equal(n.region, "R1");
  assert.equal(n.index, 1);
});

test("nextStep zwraca null gdy wszystko zrobione", () => {
  const plan = [{ region: "R1", steps: [{ id: "a" }] }];
  assert.equal(nextStep(plan, new Set(["a"])), null);
});

test("typeLabelPl zwraca polską nazwę znanego typu (także gdy slug jest liczbą)", () => {
  assert.equal(typeLabelPl("607", "Place of Power"), "Miejsce mocy");
  assert.equal(typeLabelPl(608, "Point of Interest"), "Punkt zainteresowania");
});

test("typeLabelPl spada do angielskiej nazwy dla nieznanego typu", () => {
  assert.equal(typeLabelPl("999", "Unknown Thing"), "Unknown Thing");
  assert.equal(typeLabelPl("999", undefined), "999");
});

test("słownik PL pokrywa wszystkie typy obecne w buildzie", () => {
  const inBuild = ["598", "603", "604", "605", "607", "608", "610", "611", "616", "617", "632", "633", "636", "637", "638", "641", "649"];
  for (const slug of inBuild) assert.ok(MARKER_TYPE_NAMES_PL[slug], `brak PL dla typu ${slug}`);
});

test("defaultEnabledTypes włącza typy z checklisty i domyślnie wybrane extra typy", () => {
  const markers = [
    { id: "a", itemId: "k:1", typeSlug: "646" },
    { id: "b", itemId: null, typeSlug: MARKER_TYPES.placeOfPower },
    { id: "c", itemId: null, typeSlug: MARKER_TYPES.noticeBoard }
  ];
  const on = defaultEnabledTypes(markers);
  assert.equal(on.has("646"), true, "typ checklisty domyślnie włączony");
  assert.equal(on.has(MARKER_TYPES.placeOfPower), true, "Place of Power domyślnie włączony");
  assert.equal(on.has(MARKER_TYPES.noticeBoard), false, "Notice Board domyślnie wyłączony");
});

test("defaultEnabledTypes nie włącza extra typu spoza listy domyślnej", () => {
  const markers = [{ id: "c", itemId: null, typeSlug: MARKER_TYPES.smugglerCache }];
  assert.equal(defaultEnabledTypes(markers).size, 0);
});

test("isMarkerVisible respektuje włączone typy", () => {
  const on = new Set([MARKER_TYPES.gwentCard]);
  assert.equal(isMarkerVisible({ typeSlug: MARKER_TYPES.gwentCard }, on), true);
  assert.equal(isMarkerVisible({ typeSlug: MARKER_TYPES.noticeBoard }, on), false);
});

test("DEFAULT_ON_TYPES to podzbiór typów znaczników", () => {
  const all = new Set(Object.values(MARKER_TYPES));
  for (const t of DEFAULT_ON_TYPES) assert.equal(all.has(t), true, `nieznany typ ${t}`);
});


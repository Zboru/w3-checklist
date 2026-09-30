import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  serializeState,
  parseState,
  computeProgress,
  filterItems,
  nextStep,
  normalizeQuery
} from "../src/core.js";

const IDS = new Set(["a", "b", "c"]);

test("pusty stan ma pusty zbiór i brak notatek", () => {
  const s = emptyState();
  assert.equal(s.done.size, 0);
  assert.deepEqual(s.notes, {});
});

test("serializacja i deserializacja zachowują stan", () => {
  const done = new Set(["a", "c"]);
  const notes = { a: "pamietaj o kluczu" };
  const round = parseState(serializeState(done, notes), IDS);
  assert.deepEqual([...round.done].sort(), ["a", "c"]);
  assert.deepEqual(round.notes, { a: "pamietaj o kluczu" });
});

test("uszkodzony JSON daje pusty stan zamiast wyjątku", () => {
  const s = parseState("{to nie json", IDS);
  assert.equal(s.done.size, 0);
  assert.deepEqual(s.notes, {});
});

test("nieznane ID są ignorowane, znane zachowane", () => {
  const text = JSON.stringify({ v: 1, done: { a: 1, zombie: 1 }, notes: { a: "x", zombie: "y" } });
  const s = parseState(text, IDS);
  assert.deepEqual([...s.done], ["a"]);
  assert.deepEqual(s.notes, { a: "x" });
});

test("bez listy znanych ID akceptuje wszystko", () => {
  const text = JSON.stringify({ v: 1, done: { cokolwiek: 1 }, notes: {} });
  assert.equal(parseState(text, null).done.has("cokolwiek"), true);
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

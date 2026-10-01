import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, isExcludedPlanStep } from "../scripts/lib/sheet.mjs";

const fixture = [
  ["TOTAL QUEST COMPLETION =     0%"],
  ["LOCATION", "QUEST", "", "EXTRA DETAILS"],
  ["KAER MORHEN", "VIZIMA", "WHITE ORCHARD", "", "VELEN"],
  ["MAIN QUESTS", "SIDE QUESTS", "CONTRACTS", "", "TREASURE HUNTS"],
  ["THE FOLLOWING IS THE OPTIMAL ORDER TO DO ALL THE QUESTS IN THE WITCHER 3 WITHOUT MISSING OR FAILING ANYTHING."],
  ["The extra details next to the quests may contain spoilers."],
  ["WHITE ORCHARD", "Lilac and Gooseberries Part 1 (1)", "", "-Tip A"],
  ["", "", "", "-Tip B"],
  ["WHITE ORCHARD", "Devil by the Well (2)"],
  ["WHITE ORCHARD", "The Incident at White Orchard (2)"],
  ["THE FOLLOWING QUESTS CAN NEVER BE FAILED. YOU CAN DO THEM AT ANY POINT."],
  ["WHITE ORCHARD", "Dirty Funds (2)"],
  ["VIZIMA", "Imperial Audience (2)", "", "-Tip C"],
  ["VIZIMA", "Gwent: Collect 'em All!"]
];

test("grupuje kroki w rozdziały według regionu", () => {
  const { chapters } = buildPlan(fixture);
  assert.deepEqual(chapters.map((c) => c.region), ["White Orchard", "Vizima"]);
  assert.equal(chapters[0].steps.length, 4);
  assert.equal(chapters[1].steps.length, 2);
});

test("zbiera wielolinijkowe wskazówki do właściwego kroku", () => {
  const { chapters } = buildPlan(fixture);
  const step = chapters[0].steps[0];
  assert.equal(step.name, "Lilac and Gooseberries Part 1");
  assert.equal(step.level, 1);
  assert.deepEqual(step.tips, ["-Tip A", "-Tip B"]);
});

test("oznacza kroki po separatorze jako nieprzepadające", () => {
  const { chapters } = buildPlan(fixture);
  assert.deepEqual(
    chapters[0].steps.map((s) => s.nonMissable),
    [false, false, false, true]
  );
});

test("poziom null gdy brak nawiasu liczbowego", () => {
  const { chapters } = buildPlan(fixture);
  const gwent = chapters[1].steps[1];
  assert.equal(gwent.name, "Gwent: Collect 'em All!");
  assert.equal(gwent.level, null);
  assert.deepEqual(gwent.tips, []);
});

test("krótkie wiersze nie powodują wyjątku", () => {
  assert.doesNotThrow(() => buildPlan([["a"], ["WHITE ORCHARD", "Quest (1)"]]));
});

test("id kroków są unikalne", () => {
  const { chapters } = buildPlan(fixture);
  const ids = chapters.flatMap((c) => c.steps.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("pusty / niepoprawny input zwraca pustą strukturę", () => {
  assert.deepEqual(buildPlan(null), { chapters: [] });
  assert.deepEqual(buildPlan([]), { chapters: [] });
});

test("wyklucza 'Gwent: Collect 'em All!' niezależnie od wielkości liter i spacji", () => {
  assert.equal(isExcludedPlanStep("Gwent: Collect 'em All!"), true);
  assert.equal(isExcludedPlanStep("  gwent:  collect 'em all!  "), true);
  assert.equal(isExcludedPlanStep("Collect 'em All!"), true);
});

test("nie wyklucza innych questów Gwent ani zwykłych kroków", () => {
  assert.equal(isExcludedPlanStep("Gwent: Old Pals"), false);
  assert.equal(isExcludedPlanStep("Gwent: High Stakes"), false);
  assert.equal(isExcludedPlanStep("Funeral Pyres"), false);
  assert.equal(isExcludedPlanStep(""), false);
  assert.equal(isExcludedPlanStep(null), false);
});

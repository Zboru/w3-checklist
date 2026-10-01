import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractLevel,
  normalizeName,
  matchIgnUrl,
  buildIgnIndex,
  titleFromWikiUrl,
  wikiArticleUrl,
  titleCaseRegion,
  nameVariants,
  lookupPl,
  buildPlIndex
} from "../scripts/lib/names.mjs";

test("wyciąga poziom z ostatniego nawiasu liczbowego", () => {
  assert.deepEqual(extractLevel("Devil by the Well (2)"), {
    title: "Devil by the Well",
    level: 2
  });
});

test("brak poziomu => level null i tytuł bez zmian", () => {
  assert.deepEqual(extractLevel("Gwent: Collect 'em All!"), {
    title: "Gwent: Collect 'em All!",
    level: null
  });
});

test("ignoruje nawias nieliczbowy", () => {
  assert.deepEqual(extractLevel("Kaer Morhen (quest)"), {
    title: "Kaer Morhen (quest)",
    level: null
  });
});

test("normalizacja usuwa prefiksy, interpunkcję i wielkość liter", () => {
  assert.equal(normalizeName("Contract: The White Lady"), "the white lady");
  assert.equal(normalizeName("Scavenger Hunt: Griffin School Gear"), "griffin school gear");
  assert.equal(normalizeName("A Towerful of Mice"), "a towerful of mice");
  assert.equal(normalizeName("  Devil  by the Well "), "devil by the well");
});

test("prefiks Gwent normalizuje się po obu stronach", () => {
  assert.equal(normalizeName("Gwent: Velen Players"), normalizeName("Gwent: Velen Players"));
  assert.equal(normalizeName("Gwent: Collect 'em All!"), "collect em all");
});

test("dopasowanie po znormalizowanej nazwie", () => {
  const idx = new Map([
    ["a towerful of mice", "https://www.ign.com/wikis/the-witcher-3-wild-hunt/A_Towerful_of_Mice"]
  ]);
  assert.equal(
    matchIgnUrl("A Towerful of Mice", idx),
    "https://www.ign.com/wikis/the-witcher-3-wild-hunt/A_Towerful_of_Mice"
  );
  assert.equal(matchIgnUrl("Nieznany Quest", idx), null);
});

test("buduje indeks IGN z URL-i wiki", () => {
  const idx = buildIgnIndex([
    { name: "x", wikiUrl: "/wikis/the-witcher-3-wild-hunt/A_Towerful_of_Mice#anchor" },
    { name: "y", wikiUrl: null }
  ]);
  assert.equal(
    idx.get("a towerful of mice"),
    "/wikis/the-witcher-3-wild-hunt/A_Towerful_of_Mice#anchor"
  );
  assert.equal(idx.size, 1);
});

test("titleFromWikiUrl czyta tytuł z segmentu", () => {
  assert.equal(
    titleFromWikiUrl("/wikis/the-witcher-3-wild-hunt/A_Towerful_of_Mice#x"),
    "A Towerful of Mice"
  );
});

test("wikiArticleUrl usuwa kotwicę, żeby link prowadził do początku artykułu", () => {
  assert.equal(
    wikiArticleUrl(
      "https://www.ign.com/wikis/the-witcher-3-wild-hunt/Kaer_Morhen#kaer-morhen-complete"
    ),
    "https://www.ign.com/wikis/the-witcher-3-wild-hunt/Kaer_Morhen"
  );
  assert.equal(
    wikiArticleUrl("https://www.ign.com/wikis/the-witcher-3-wild-hunt/A_Princess_in_Distress"),
    "https://www.ign.com/wikis/the-witcher-3-wild-hunt/A_Princess_in_Distress"
  );
  assert.equal(wikiArticleUrl(null), null);
});

test("titleCaseRegion formatuje region do wyświetlenia", () => {
  assert.equal(titleCaseRegion("WHITE ORCHARD"), "White Orchard");
  assert.equal(titleCaseRegion("NOVIGRAD/OXENFURT"), "Novigrad/Oxenfurt");
});

test("nameVariants zdejmuje sufiksy Complete/Part/numery", () => {
  const v = nameVariants("Lilac and Gooseberries Part 1");
  assert.ok(v.includes("Lilac and Gooseberries Part 1"));
  assert.ok(v.includes("Lilac and Gooseberries"));
  assert.ok(nameVariants("Deadly Crossing (II)").includes("Deadly Crossing"));
  assert.ok(nameVariants("Kaer Morhen Complete").includes("Kaer Morhen"));
  assert.ok(nameVariants("Griffin School Gear (Basic)").includes("Griffin School Gear"));
});

test("lookupPl próbuje wariantów nazwy", () => {
  const index = buildPlIndex({ "Lilac and Gooseberries": "Bez i agrest" });
  assert.equal(lookupPl("Lilac and Gooseberries Part 1", index), "Bez i agrest");
  assert.equal(lookupPl("Nieznany Quest", index), null);
});

test("buildPlIndex normalizuje klucze i nie nadpisuje istniejących", () => {
  const index = buildPlIndex({ "A Towerful of Mice": "Mysia wieża", "a towerful of mice": "inne" });
  assert.equal(index.get("a towerful of mice"), "Mysia wieża");
});


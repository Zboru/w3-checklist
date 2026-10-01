import { test } from "node:test";
import assert from "node:assert/strict";
import { selectMarkers } from "../scripts/lib/markers.mjs";
import { EXTRA_TYPES } from "../src/core.js";

const mk = (id, typeSlug, taskId = null) => ({
  id,
  lat: 1,
  lng: 2,
  markerName: `m${id}`,
  markerSlug: `m${id}`,
  typeSlug,
  checklistTaskId: taskId
});

test("selectMarkers zachowuje znaczniki powiązane z checklistą (taskId jako string)", () => {
  const raw = [mk("1", "608", 1001)];
  const out = selectMarkers(raw, new Set(["1"]));
  assert.equal(out.length, 1);
  assert.equal(out[0].taskId, "1001");
});

test("selectMarkers dorzuca extra znaczniki z dozwolonego typu z taskId null", () => {
  const poi = [...EXTRA_TYPES][0];
  const raw = [mk("9", poi)];
  const out = selectMarkers(raw, new Set());
  assert.equal(out.length, 1);
  assert.equal(out[0].taskId, null);
  assert.equal(out[0].typeSlug, poi);
});

test("selectMarkers pomija niepowiązane znaczniki spoza whitelisty", () => {
  const raw = [mk("7", "639"), mk("8", "999")];
  const out = selectMarkers(raw, new Set());
  assert.deepEqual(out, []);
});

test("selectMarkers łączy powiązane i extra bez duplikatów ani pominięć", () => {
  const poi = [...EXTRA_TYPES][0];
  const raw = [mk("1", "646", 5), mk("2", poi), mk("3", "639")];
  const out = selectMarkers(raw, new Set(["1"]));
  assert.deepEqual(out.map((m) => m.id).sort(), ["1", "2"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManifest, buildServiceWorker, cacheVersionFrom } from "../scripts/lib/pwa.mjs";

test("manifest ma pola wymagane do instalacji na iPhonie", () => {
  const m = buildManifest();
  assert.equal(m.name, "Wiedźmin 3 — krok po kroku");
  assert.equal(m.short_name, "Wiedźmin 3");
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "./");
  assert.equal(m.scope, "./");
  assert.equal(m.lang, "pl");
  assert.equal(m.theme_color, "#101014");
  assert.equal(m.background_color, "#101014");
});

test("manifest ma ikony 192 i 512 w formacie PNG", () => {
  const icons = buildManifest().icons;
  const bySize = new Map(icons.map((i) => [i.sizes, i]));
  assert.equal(bySize.get("192x192")?.type, "image/png");
  assert.equal(bySize.get("512x512")?.type, "image/png");
  assert.ok(icons.every((i) => i.src.startsWith("./icons/")), "ikony leżą obok index.html");
});

test("service worker jest poprawnym JavaScriptem", () => {
  const src = buildServiceWorker("20261001070236");
  assert.doesNotThrow(() => new Function(src));
});

test("service worker wersjonuje cache, by deploy unieważniał stary", () => {
  const src = buildServiceWorker("20261001070236");
  assert.match(src, /20261001070236/);
  assert.match(src, /caches\.delete/);
});

test("cacheVersionFrom buduje wersję z daty generowania", () => {
  assert.equal(cacheVersionFrom("2026-10-01T07:02:36.752Z"), "20261001070236");
  assert.match(cacheVersionFrom(null), /^\d+$/);
});

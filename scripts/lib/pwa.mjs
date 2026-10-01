/**
 * Generowanie artefaktów PWA (manifest + service worker). Trzymane osobno od
 * builda, żeby dało się je przetestować bez uruchamiania całego pipeline'u.
 *
 * Aplikacja jest hostowana na GitHub Pages w podkatalogu, więc wszystkie
 * ścieżki są względne (`./`), a zasięg service workera to ten podkatalog.
 */

/** Kolor zgodny ze zmienną `--bg` w src/styles.css. */
export const THEME_COLOR = "#101014";

/** Wersja cache wyprowadzona z czasu generowania (deploy = nowy klucz). */
export function cacheVersionFrom(generatedAt) {
  const digits = String(generatedAt || "").replace(/\D/g, "");
  return digits.slice(0, 14) || String(Date.now());
}

export function buildManifest() {
  return {
    name: "Wiedźmin 3 — krok po kroku",
    short_name: "Wiedźmin 3",
    description:
      "Checklista Wiedźmina 3 krok po kroku — baza, Serca z Kamienia i Krew i Wino. Bez pomijania, z linkami do IGN.",
    lang: "pl",
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  };
}

/** Pliki powłoki cache'owane przy instalacji (apka działa bez internetu). */
export const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-180.png"
];

export function buildServiceWorker(version) {
  return `/* Wiedźmin 3 — service worker. Plik generowany przez scripts/build.mjs; nie edytuj ręcznie. */
const CACHE = "w3checklist-${version}";
const PRECACHE = ${JSON.stringify(PRECACHE)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Pojedynczy brakujący plik nie może wywalać całej instalacji.
      await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Kafelki MapGenie, linki IGN i wszystko obce: prosto z sieci, bez cache.
  if (url.origin !== self.location.origin) return;
  // Sam service worker zawsze z sieci, inaczej nie dałoby się go zaktualizować.
  if (url.pathname.endsWith("/sw.js")) return;

  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const fromNetwork = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached || Response.error());
  return cached || fromNetwork;
}
`;
}

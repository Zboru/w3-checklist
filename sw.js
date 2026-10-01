/* Wiedźmin 3 — service worker. Plik generowany przez scripts/build.mjs; nie edytuj ręcznie. */
const CACHE = "w3checklist-20261001072008";
const PRECACHE = ["./","./index.html","./manifest.json","./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-180.png"];

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

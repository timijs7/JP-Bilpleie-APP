// network-first SW with offline fallback
const CACHE = "pwa-cache-online-v341";
const ASSETS = ["./","./index.html","./manifest.json","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))); });
self.addEventListener("activate", (e) => { e.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))); await self.clients.claim(); })()); });
self.addEventListener("fetch", (e) => {
  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request, { cache: "no-store" });
      const cache = await caches.open(CACHE); cache.put(e.request, fresh.clone());
      return fresh;
    } catch {
      const cached = await caches.match(e.request);
      return cached || new Response("Offline un nav kešā.", { status: 503 });
    }
  })());
});

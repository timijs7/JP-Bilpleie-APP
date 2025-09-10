self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open('pwa-cache-v3').then((cache) => cache.addAll([
    './',
    './index.html',
    './manifest.json'
  ])));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== 'pwa-cache-v3').map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});

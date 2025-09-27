// Cache first for static assets, network first for other requests
const CACHE_VERSION = '1';
const CACHE_STATIC = `static-cache-v${CACHE_VERSION}`;
const CACHE_DYNAMIC = `dynamic-cache-v${CACHE_VERSION}`;
const CACHE_DOCS = 'documents-cache'; // Jauns cache priekš dokumentiem

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./service-worker.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/plan.png",
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        console.log('[Service Worker] Precaching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keyList => {
        return Promise.all(keyList.map(key => {
          if (key !== CACHE_STATIC && key !== CACHE_DYNAMIC) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        }));
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - handle documents and static assets differently
self.addEventListener("fetch", (event) => {
  // Pārbaudam vai šis ir dokuments no mūsu cache
  if (event.request.url.includes('/documents/')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
    return;
  }

  // Parastā loģika statiskajiem failiem
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached response if found
        if (cachedResponse) {
          return cachedResponse;
        }

        // If not in cache, fetch from network
        return fetch(event.request)
          .then(response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response as it can only be consumed once
            const responseToCache = response.clone();

            // Add to dynamic cache
            caches.open(CACHE_DYNAMIC)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // If both cache and network fail, return offline page
            return new Response("Lietotne ir bezsaistē. Lūdzu, pārbaudiet interneta savienojumu.", {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Background Sync - sinhronizē dokumentus, kad ir internets
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-documents') {
    event.waitUntil(syncDocuments());
  }
});

async function syncDocuments() {
  try {
    const cache = await caches.open('documents-cache');
    const requests = await cache.keys();
    
    for (const request of requests) {
      if (request.url.includes('/documents/')) {
        const response = await cache.match(request);
        const docData = JSON.parse(response.headers.get('X-Document-Data'));
        
        try {
          // Mēģinām nosūtīt dokumentu
          const blob = await response.blob();
          const reader = new FileReader();
          const dataUri = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          // Nosūtām uz serveri
          await sendPdfDataUriToDrive(docData.entry, dataUri);
          
          // Ja veiksmīgi nosūtīts, dzēšam no cache
          await cache.delete(request);
          console.log(`Successfully synced and removed from cache: ${docData.fileName}`);
        } catch (e) {
          console.error(`Failed to sync document: ${docData.fileName}`, e);
        }
      }
    }
  } catch (e) {
    console.error('Document sync failed:', e);
  }
}

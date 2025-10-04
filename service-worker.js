// Cache first for static assets, network first for other requests
const CACHE_VERSION = '2';
const CACHE_STATIC = `static-cache-v${CACHE_VERSION}`;
const CACHE_DYNAMIC = `dynamic-cache-v${CACHE_VERSION}`;
const CACHE_DOCS = 'documents-cache'; // Jauns cache priekš dokumentiem

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./service-worker.js",
  "./storage-manager.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/plan.png",
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log('[Service Worker] Installing version', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        console.log('[Service Worker] Precaching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[Service Worker] Failed to cache static assets:', err);
        throw err;
      })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keyList => {
        return Promise.all(keyList.map(key => {
          // Keep current static, dynamic and documents caches, delete everything else
          if (key !== CACHE_STATIC && key !== CACHE_DYNAMIC && key !== CACHE_DOCS) {
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
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Pārbaudam vai šis ir dokuments no mūsu cache
  if (event.request.url.includes('/documents/')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
    return;
  }

  // For external CDN resources (html2canvas, jsPDF), always try cache first
  if (event.request.url.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Try to fetch and cache
          return fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                const responseToCache = response.clone();
                caches.open(CACHE_STATIC)
                  .then(cache => {
                    cache.put(event.request, responseToCache);
                  });
              }
              return response;
            })
            .catch(() => {
              // If offline and not cached, return error response
              return new Response("Resurs nav pieejams bezsaistē.", {
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
              });
            });
        })
    );
    return;
  }

  // Parastā loģika statiskajiem failiem - Cache First strategy
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached response if found
        if (cachedResponse) {
          // Optionally, fetch in background to update cache
          fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                caches.open(CACHE_DYNAMIC)
                  .then(cache => {
                    cache.put(event.request, response);
                  });
              }
            })
            .catch(() => {
              // Ignore network errors when updating cache in background
            });
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

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_STATIC)
        .then(cache => cache.addAll(event.data.urls))
        .catch(err => console.error('Failed to cache URLs:', err))
    );
  }
});

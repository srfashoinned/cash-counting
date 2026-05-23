/**
 * CASH COUNTER LEDGER - service-worker.js
 * Offline-first PWA service worker
 */

const CACHE_NAME = 'ccl-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
];

/* Install: cache all assets */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS.map(url => {
        // For cross-origin resources, use no-cors
        if (url.startsWith('https://fonts.')) {
          return new Request(url, { mode: 'no-cors' });
        }
        return url;
      })).catch(err => console.warn('SW cache failed:', err));
    })
  );
  self.skipWaiting();
});

/* Activate: delete old caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Fetch: cache-first for local assets, network-first for external */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Cache-first strategy for same-origin + Google Fonts
  if (url.origin === self.location.origin || url.hostname.includes('fonts.')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // If completely offline and no cache, return offline fallback
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
});

/* Background sync - log for future use */
self.addEventListener('sync', event => {
  console.log('SW sync event:', event.tag);
});

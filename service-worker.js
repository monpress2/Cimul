// service-worker.js - basic app shell caching
const CACHE_NAME = 'lumic-shell-v1';
const ASSETS = [
  '/', '/index.html', '/lumic.html', '/profile.html', '/logo.png', '/home.jpg', '/idb.js', '/pwa-enhancements.js', '/manifest.webmanifest'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  const req = event.request;
  // For navigation requests return cached shell
  if (req.mode === 'navigate'){
    event.respondWith(caches.match('/index.html').then(resp => resp || fetch(req).catch(()=>caches.match('/index.html'))));
    return;
  }
  // Try cache first, then network
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(r => {
    // cache certain responses
    if (req.method === 'GET' && r && r.status === 200 && r.type !== 'opaque'){
      const copy = r.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
    }
    return r;
  }).catch(() => cached)));
});

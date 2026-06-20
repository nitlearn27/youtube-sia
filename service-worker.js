// Caches the app shell so the UI loads instantly and works offline.
// Cross-origin requests (YouTube player + thumbnails) are never cached —
// they always go to the network and need a connection to play.

const CACHE = 'sia-v5';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/storage.js',
  './js/youtube.js',
  './js/player.js',
  './js/parent.js',
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // let YouTube/thumbnails hit the network
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});

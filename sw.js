// News Ramen service worker: app shell offline, news network-first, saved images cached.
const SHELL = 'ramen-shell-v3';
const DATA = 'ramen-data-v1';
const IMG = 'ramen-img-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'sky.js', 'ramen-96.png', 'favicon.png', 'fonts/okasa.otf', 'icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA, IMG].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin && url.pathname.includes('/data/')) {
    // News: always try the network, fall back to the last copy when offline.
    const key = url.origin + url.pathname;
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(DATA).then((c) => c.put(key, copy)); }
      return r;
    }).catch(() => caches.match(key)));
    return;
  }
  if (url.origin === location.origin) {
    // App files: network first so updates show straight away; cached copy when offline.
    e.respondWith(caches.open(SHELL).then((c) => fetch(e.request)
      .then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })
      .catch(() => c.match(e.request, { ignoreSearch: true }))));
    return;
  }
  if (e.request.destination === 'image') {
    // Images of saved stories were stored on save; serve those offline.
    e.respondWith(caches.open(IMG).then(async (c) => (await c.match(e.request.url)) || fetch(e.request)));
  }
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'cache-img') {
    caches.open(IMG).then((c) => fetch(e.data.url, { mode: 'no-cors' }).then((r) => c.put(e.data.url, r)).catch(() => {}));
  }
});

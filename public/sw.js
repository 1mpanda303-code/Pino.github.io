const VERSION = 'luma-workbench-v11';
const appUrl = (path = '') => new URL(path, self.registration.scope).toString();
const SHELL = [
  appUrl(),
  appUrl('index.html'),
  appUrl('manifest.webmanifest'),
  appUrl('favicon.svg'),
  appUrl('icons/icon-192.png'),
  appUrl('icons/icon-512.png'),
  appUrl('schemas/luma-learning-report-v1.schema.json'),
  appUrl('schemas/examples/luma-learning-report-v1.example.json'),
  appUrl('schemas/luma-live-report-v2.schema.json'),
  appUrl('schemas/examples/luma-live-report-v2.example.json'),
  appUrl('schemas/luma-ai-assistant-report-v1.schema.json'),
  appUrl('schemas/examples/luma-ai-assistant-report-v1.example.json'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) caches.open(VERSION).then((cache) => cache.put(appUrl(), response.clone()));
      return response;
    }).catch(() => caches.match(appUrl())));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        return caches.open(VERSION).then((cache) => cache.put(event.request, copy)).then(() => response);
      });
    }),
  );
});

const SHELL = ['/index.html', '/manifest.json', '/icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('timetopay-shell-v2').then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  // Clean up old cache versions.
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== 'timetopay-shell-v2').map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Only intercept same-origin navigation requests — assets go to network.
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match('/index.html'))
  );
});

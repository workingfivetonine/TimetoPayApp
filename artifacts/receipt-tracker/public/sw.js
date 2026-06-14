const SHELL = ['/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('timetopay-shell-v1').then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Only intercept same-origin navigations — everything else goes to network.
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match('/index.html'))
  );
});

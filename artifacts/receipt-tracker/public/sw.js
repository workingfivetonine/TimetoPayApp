// Offline fallback for the web app.
//
// This is the service worker that actually ships. `server/serve.js` builds a
// smarter, build-hash-versioned one, but Vercel never runs it — vercel.json does
// a static `expo export` and serves `dist/`, so this file is what
// `app/_layout.tsx` registers.
//
// That distinction caused a real bug. The old version precached `/index.html`
// under a hardcoded cache name and only ever wrote it at install time. A service
// worker reinstalls when its own bytes change, and this file is static across
// deploys — so the cached shell was frozen at whatever the user's very first
// visit downloaded. Any momentary network failure then served that shell, which
// pointed at an old hashed bundle, which Vercel still hosts forever. The app
// booted perfectly, months out of date, with nothing to indicate it.
//
// So: keep the offline fallback, but refresh it on every successful navigation.
// The worst case is now "one visit behind" rather than "however old your first
// visit was".
const CACHE = 'timetopay-shell-v3';
const APP_SHELL = '/index.html';
const SHELL = [APP_SHELL, '/manifest.json', '/icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  // Drop every other cache. Bumping CACHE above is what evicts the stale shells
  // already sitting in existing users' browsers.
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Only intercept same-origin navigation requests — assets go to network.
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Keep the fallback pointed at the build the user last loaded online.
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(APP_SHELL, copy)).catch(() => {});
        }
        return res;
      })
      // Offline. Serve the last good shell; if there isn't one, let the browser
      // show its own error rather than resolving to undefined.
      .catch(() => caches.match(APP_SHELL).then((r) => r || Response.error()))
  );
});

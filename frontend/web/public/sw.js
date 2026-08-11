// Hand-written service worker (no next-pwa dependency — see manifest.ts's
// sibling comment). Scope is '/', matching manifest.ts's scope, which is
// deliberately relative rather than tenant-hardcoded: this file is served
// identically from every tenant subdomain, and each origin gets its own
// independent SW registration/cache under the browser's normal same-origin
// rules — no cross-tenant leakage risk from sharing this one static file.
const CACHE_VERSION = 'topiadesk-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_URLS = [
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never intercept mutations
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Full-page navigations: network-first so a signed-in user always sees
  // fresh app shell/data when online, falling back to the offline route
  // only once the network is genuinely unreachable.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline').then((cached) => cached ?? caches.match(request))),
    );
    return;
  }

  // Next.js build assets are content-hashed and immutable — safe to
  // cache-first indefinitely, no revalidation needed.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })),
    );
    return;
  }

  // BFF/API reads: network-first, falling back to the last-known response
  // only when offline — a stale cached read is only ever surfaced when
  // there is no way to reach the real one, never preferred over it.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(
          () =>
            caches.match(request).then(
              (cached) =>
                cached ??
                new Response(JSON.stringify({ offline: true, message: 'No network connection and no cached response available.' }), {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' },
                }),
            ),
        ),
    );
  }
});

// Hand-written service worker (no next-pwa dependency — see manifest.ts's
// sibling comment). Scope is '/', matching manifest.ts's scope, which is
// deliberately relative rather than tenant-hardcoded: this file is served
// identically from every tenant subdomain, and each origin gets its own
// independent SW registration/cache under the browser's normal same-origin
// rules — no cross-tenant leakage risk from sharing this one static file.
// Bumped v1 -> v2 deliberately: the activate handler below deletes every
// cache whose key isn't one of the two current names, so changing the
// version is what purges the unbounded v1 runtime cache from browsers that
// already have one. v1 wrote EVERY /api/ GET response (including 4xx/5xx)
// into a cache with no eviction and no size cap, so a profile that had used
// the app for a while accumulated a very large on-disk cache that had to be
// consulted and written on every single request — real memory/disk pressure
// on the client, and authenticated response bodies persisted to disk.
// v2 -> v3: v2 cached up to 50 API GET responses so an offline user could
// "still see their last-known data", but never cached page HTML — only
// '/offline' was precached, so the navigate handler's `caches.match(request)`
// fallback could never hit. Every offline navigation dead-ended on the
// offline page, which meant that API cache was unreachable: the SW was
// storing data the user had no way to view. v3 caches successful page
// documents and RSC payloads so the app itself opens offline.
const CACHE_VERSION = 'topiadesk-v3';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
/** Page documents + RSC payloads, so a previously-visited route renders offline. */
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const PAGE_CACHE_MAX_ENTRIES = 40;

// Never persisted to disk: an offline-replayed login screen is useless at
// best, and these are the documents most likely to embed session state.
const UNCACHEABLE_PAGE_PREFIXES = ['/login', '/logout', '/offline', '/portal/login'];

function isCacheablePage(url, response) {
  if (!response || !response.ok || response.type === 'opaque') return false;
  if (UNCACHEABLE_PAGE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return false;
  // Honour an explicit server opt-out rather than second-guessing it.
  const cc = response.headers.get('Cache-Control') || '';
  return !cc.includes('no-store');
}

// Hard ceiling on the API read cache. This exists purely so an offline user
// still sees their last-known data; it is not a performance cache (every
// online read goes to the network first regardless), so a small bound is
// enough and keeps the cache cheap to maintain.
const API_CACHE = `${CACHE_VERSION}-api`;
const API_CACHE_MAX_ENTRIES = 50;
// Generous enough to hold one build's app shell, small enough that stale
// builds' chunks age out instead of accumulating forever.
const STATIC_CACHE_MAX_ENTRIES = 150;

/** Oldest-first eviction — Cache Storage keys() returns insertion order. */
async function putCapped(cacheName, request, response, maxEntries) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
  }
}

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
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE && key !== API_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Session teardown. v2 persisted up to 50 authenticated API responses and
 * v3 additionally persists page documents, none of which were ever cleared
 * on logout — on a shared or lost phone the next person could open the
 * installed app offline and read the previous user's data straight out of
 * Cache Storage. The signing-out client posts PURGE_SESSION_CACHES before
 * it hands off to the logout route; the immutable build-asset cache is
 * deliberately kept (content-hashed JS reveals nothing and re-downloading
 * it on every login is pure waste).
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PURGE_SESSION_CACHES') {
    event.waitUntil(Promise.all([caches.delete(PAGE_CACHE), caches.delete(API_CACHE)]));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never intercept mutations
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Full-page navigations: network-first so a signed-in user always sees
  // fresh app shell/data when online. On failure, serve THIS route's own
  // cached document if we have one, and only fall back to /offline when the
  // route has genuinely never been visited. Ordering matters — checking
  // '/offline' first (as v2 did) makes the cached-page branch dead code.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheablePage(url, response)) {
            const copy = response.clone();
            putCapped(PAGE_CACHE, request, copy, PAGE_CACHE_MAX_ENTRIES).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          // `ignoreSearch` so /accounts?page=2 can still fall back to the
          // cached /accounts document rather than dropping to /offline.
          const cached = (await caches.match(request)) ?? (await caches.match(request, { ignoreSearch: true }));
          return cached ?? (await caches.match('/offline'));
        }),
    );
    return;
  }

  // App Router client-side navigation doesn't issue a `navigate` request —
  // it fetches an RSC payload for the target route (?_rsc=... / RSC: 1).
  // Without caching these, tapping a link inside the installed app while
  // offline fails even though the destination's document is cached.
  if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheablePage(url, response)) {
            const copy = response.clone();
            putCapped(PAGE_CACHE, request, copy, PAGE_CACHE_MAX_ENTRIES).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match(request)) ?? (await caches.match(request, { ignoreSearch: true }));
          // No cached payload: fail cleanly so Next falls back to a real
          // navigation (which the handler above can answer from PAGE_CACHE)
          // instead of hanging on a rejected fetch.
          return cached ?? Response.error();
        }),
    );
    return;
  }

  // Next.js build assets are content-hashed and immutable — safe to
  // cache-first indefinitely, no revalidation needed.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        // Capped as well: chunk filenames are content-hashed, so every
        // rebuild introduces a fresh set of URLs and the old ones are never
        // requested again — without a bound this cache grows by roughly a
        // full build's worth of JS on every deploy and is never reclaimed.
        if (response.ok) {
          const copy = response.clone();
          putCapped(RUNTIME_CACHE, request, copy, STATIC_CACHE_MAX_ENTRIES).catch(() => {});
        }
        return response;
      })),
    );
    return;
  }

  // BFF/API reads: network-first, falling back to the last-known response
  // only when offline — a stale cached read is only ever surfaced when
  // there is no way to reach the real one, never preferred over it.
  if (url.pathname.startsWith('/api/')) {
    // Auth/session endpoints are never cached: a stale cached identity is
    // worse than no answer, and these are the responses least safe to
    // persist to disk.
    if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/portal/auth/')) return;

    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only successful reads are worth replaying offline. v1 cached
          // every status, so a transient 401/500 became the "offline"
          // answer served back to the user indefinitely.
          if (response.ok) {
            const copy = response.clone();
            putCapped(API_CACHE, request, copy, API_CACHE_MAX_ENTRIES).catch(() => {});
          }
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

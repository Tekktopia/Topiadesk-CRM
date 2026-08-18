'use client';

import { useEffect } from 'react';

/**
 * Registers public/sw.js on mount. A separate client component (rather than
 * inlining this in the server-rendered RootLayout) since `navigator` only
 * exists in the browser. Silently no-ops in unsupported browsers/contexts
 * (e.g. Playwright's default context) rather than throwing — installability
 * is a progressive enhancement, not a hard requirement to use the app.
 *
 * On registration FAILURE it now actively unregisters whatever service
 * worker is already controlling the page. That asymmetry is deliberate and
 * was a real, user-visible bug:
 *
 * When registration fails, the browser keeps running the LAST worker that
 * installed successfully — and, because registration is exactly the step
 * that would replace it, that worker is pinned indefinitely. A local dev
 * stack whose TLS certificate stops being trusted (untrusted mkcert CA)
 * hits this permanently: Chrome refuses to fetch /sw.js over a origin with
 * a certificate error, so a months-old worker keeps serving the app with no
 * possible upgrade path. The v1 worker that gets stranded this way wrote an
 * UNCAPPED Cache Storage entry for every /api/ GET — so every filter change
 * and every search keystroke grew an ever-larger on-disk cache, and list
 * pages froze on interaction.
 *
 * Unregistering is strictly safer than leaving it: the worker only ever
 * provides offline caching, so removing it degrades to a normal online app
 * rather than breaking anything. The next successful load re-registers the
 * current version cleanly.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(async (error) => {
      console.error('Service worker registration failed', error);
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length === 0) return;
        await Promise.all(registrations.map((r) => r.unregister()));
        // Drop the stranded worker's caches too — unregistering stops it
        // controlling the page but leaves its Cache Storage on disk, which
        // is the part that had actually grown unbounded.
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith('topiadesk-')).map((k) => caches.delete(k)));
        }
        console.warn(
          `Removed ${registrations.length} stale service worker registration(s) that could no longer be updated. ` +
            'Offline support is disabled until /sw.js can be fetched again (on a local stack, check the TLS certificate is trusted).',
        );
      } catch (cleanupError) {
        console.error('Failed to clean up stale service workers', cleanupError);
      }
    });
  }, []);

  return null;
}

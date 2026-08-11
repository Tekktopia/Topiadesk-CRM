'use client';

import { useEffect } from 'react';

/**
 * Registers public/sw.js on mount. A separate client component (rather than
 * inlining this in the server-rendered RootLayout) since `navigator` only
 * exists in the browser. Silently no-ops in unsupported browsers/contexts
 * (e.g. Playwright's default context) rather than throwing — installability
 * is a progressive enhancement, not a hard requirement to use the app.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed', error);
    });
  }, []);

  return null;
}

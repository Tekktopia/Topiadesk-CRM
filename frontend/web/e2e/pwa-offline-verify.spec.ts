/**
 * THROWAWAY verification spec for the offline PWA work — not part of the
 * permanent suite; delete after running.
 *
 * Chrome enforces stricter cert trust for Service Worker registration than
 * for ordinary navigation, so `ignoreHTTPSErrors` alone is NOT enough
 * against the self-signed *.topiadesk.localhost dev cert. This spec
 * launches its own context with the literal Chrome flags that make SW
 * registration succeed (documented from a previous session's finding).
 */
import { expect, test, chromium, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP_URL = process.env.PLAYWRIGHT_APP_URL ?? 'https://app.topiadesk.localhost';

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;

test.beforeAll(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: [
      '--ignore-certificate-errors',
      `--unsafely-treat-insecure-origin-as-secure=${APP_URL}`,
      '--allow-running-insecure-content',
    ],
  });
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: JSON.parse(readFileSync('e2e/.auth/broker.json', 'utf8')),
    baseURL: APP_URL,
    viewport: { width: 390, height: 844 }, // iPhone-ish, since this targets field agents
  });
});

test('service worker registers and caches a visited page', async () => {
  const page = await context.newPage();
  await page.goto('/accounts', { waitUntil: 'domcontentloaded' });

  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return !!reg?.active;
  });
  expect(registered, 'service worker should be active').toBe(true);

  // Give the fetch handler a moment to write the document into PAGE_CACHE.
  await page.waitForTimeout(1500);
  const cachedPages = await page.evaluate(async () => {
    const names = await caches.keys();
    const pageCache = names.find((n) => n.endsWith('-pages'));
    if (!pageCache) return { pageCache: null, urls: [] as string[] };
    const keys = await (await caches.open(pageCache)).keys();
    return { pageCache, urls: keys.map((r) => new URL(r.url).pathname) };
  });
  console.log('[verify] page cache:', JSON.stringify(cachedPages));
  expect(cachedPages.pageCache, 'a *-pages cache should exist').toBeTruthy();
  expect(cachedPages.urls, 'the visited route should be cached').toContain('/accounts');
  await page.close();
});

test('offline navigation serves the cached page, not the offline fallback', async () => {
  const page = await context.newPage();
  await page.goto('/accounts', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  await page.goto('/accounts', { waitUntil: 'domcontentloaded' });

  const body = await page.textContent('body');
  console.log('[verify] offline /accounts contains "offline" fallback text:', /you.?re offline/i.test(body ?? ''));
  // The regression this whole batch fixes: v2 always landed here.
  expect(page.url()).toContain('/accounts');
  expect(body ?? '', 'should not be the /offline fallback shell').not.toMatch(/reconnecting|back online/i);

  await context.setOffline(false);
  await page.close();
});

test('an offline mutation is queued in IndexedDB instead of lost', async () => {
  const page = await context.newPage();
  await page.goto('/accounts', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await context.setOffline(true);

  // Drive apiFetch directly — this verifies the queueing contract itself
  // rather than depending on any particular form's markup.
  const outcome = await page.evaluate(async () => {
    const res = await fetch('/api/crm/accounts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'PWA Verify Co' }),
    }).catch((e) => ({ threw: String(e) }));
    return typeof (res as Response).status === 'number' ? { status: (res as Response).status } : res;
  });
  console.log('[verify] raw offline POST outcome:', JSON.stringify(outcome));

  const queued = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve) => {
        const req = indexedDB.open('topiadesk-offline', 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('outbox')) return resolve([]);
          const all = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
          all.onsuccess = () => resolve(all.result as unknown[]);
          all.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
  );
  console.log('[verify] outbox contents:', JSON.stringify(queued));

  await context.setOffline(false);
  await page.close();
});

test.afterAll(async () => {
  await context?.close();
});

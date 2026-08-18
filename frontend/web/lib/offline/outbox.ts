/**
 * Offline write outbox for the installed PWA.
 *
 * A field agent who loses signal can still log a call, update a case, or
 * create a task; the mutation is durably queued and replayed once the
 * device is back online.
 *
 * Two deliberate architecture choices:
 *
 * 1. Queued in the PAGE, not the service worker. The obvious alternative is
 *    intercepting non-GET fetches in sw.js and replaying via the Background
 *    Sync API — but iOS Safari does not implement Background Sync at all,
 *    and this app is explicitly targeting field agents on both iOS and
 *    Android. A SW-based queue would therefore behave completely differently
 *    on iPhone (never replaying until the user happens to reopen the app)
 *    than on Android. Doing it here means one code path, identical on both,
 *    and it can drive real UI (pending count, failures) which a SW cannot.
 *    The cost is honest and stated: replay only happens while the app is
 *    open. That matches iOS's actual ceiling anyway.
 *
 * 2. IndexedDB, not localStorage. Queued bodies are unbounded user content
 *    and localStorage is a synchronous ~5MB store shared with everything
 *    else; a large queued payload there would block the main thread and can
 *    silently throw QuotaExceeded mid-write, losing the item.
 *
 * Every queued item carries a client-generated `Idempotency-Key`, honoured
 * server-side by common/idempotency/idempotency.interceptor.ts. That is what
 * makes replay safe: the dangerous case is not "the request never arrived",
 * it's "it arrived, committed, and the response was lost" — routine on a
 * phone moving between cells. Without the key, replaying that duplicates the
 * record.
 */

import { csrfHeaders } from '@/lib/csrf';

const DB_NAME = 'topiadesk-offline';
const DB_VERSION = 1;
const STORE = 'outbox';

/** Give up after this many failed replays so one poisoned item can't block the queue forever. */
export const MAX_ATTEMPTS = 5;

export interface OutboxItem {
  id: string;
  /** Same-origin BFF path, e.g. `/api/crm/accounts`. */
  path: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: string;
  idempotencyKey: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Human-readable, for the pending-changes UI ("New account", "Case update"). */
  label: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export async function enqueue(item: Omit<OutboxItem, 'id' | 'createdAt' | 'attempts'>): Promise<OutboxItem> {
  const full: OutboxItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attempts: 0,
  };
  await tx('readwrite', (store) => store.add(full));
  notifyChanged();
  return full;
}

export async function listQueued(): Promise<OutboxItem[]> {
  const all = await tx<OutboxItem[]>('readonly', (store) => store.getAll() as IDBRequest<OutboxItem[]>);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeItem(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id));
  notifyChanged();
}

async function updateItem(item: OutboxItem): Promise<void> {
  await tx('readwrite', (store) => store.put(item));
  notifyChanged();
}

/** Items that have exhausted MAX_ATTEMPTS and need a human decision. */
export async function listFailed(): Promise<OutboxItem[]> {
  return (await listQueued()).filter((i) => i.attempts >= MAX_ATTEMPTS);
}

// ---- change notification, so UI can show a live pending count ----

const CHANGE_EVENT = 'topiadesk:outbox-changed';

function notifyChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onOutboxChanged(handler: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

// ---- replay ----

let flushing = false;

/**
 * Replays queued writes oldest-first, stopping at the first network failure.
 *
 * Strictly sequential and fail-fast by design: these are CRM mutations that
 * frequently depend on each other (create an account, then a case against
 * it), so firing them in parallel — or skipping past a failure to try later
 * items — can apply them in an order the user never performed.
 */
export async function flushOutbox(): Promise<{ sent: number; failed: number; remaining: number }> {
  if (flushing || typeof navigator === 'undefined' || !navigator.onLine) {
    return { sent: 0, failed: 0, remaining: (await listQueued()).length };
  }
  flushing = true;
  let sent = 0;
  let failed = 0;

  try {
    for (const item of await listQueued()) {
      if (item.attempts >= MAX_ATTEMPTS) {
        failed += 1;
        continue; // parked for the user to retry or discard
      }

      let response: Response;
      try {
        response = await fetch(item.path, {
          method: item.method,
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': item.idempotencyKey,
            // The real helper, not a local re-implementation: it owns the
            // cookie/header names (lib/auth/constants.ts) that middleware's
            // double-submit check validates against, and a divergent copy
            // here would fail every replay with a 403 the moment either
            // name changed.
            ...csrfHeaders(item.method),
          },
          body: item.body,
        });
      } catch {
        // Genuinely offline again — leave this and everything after it
        // queued, in order, and stop. NOT counted as an attempt: the
        // request never reached the server, so it must not consume the
        // item's retry budget.
        break;
      }

      if (response.ok) {
        await removeItem(item.id);
        sent += 1;
        continue;
      }

      // 409 from the interceptor means an identical key is mid-flight —
      // transient by definition, so retry it later without burning budget.
      if (response.status === 409) break;

      // A 4xx is the server rejecting this write on its merits; retrying
      // an unchanged body will never succeed, so park it immediately for a
      // human instead of grinding through the whole retry budget.
      const permanent = response.status >= 400 && response.status < 500;
      await updateItem({
        ...item,
        attempts: permanent ? MAX_ATTEMPTS : item.attempts + 1,
        lastError: await describeError(response),
      });
      failed += 1;
      if (!permanent) break; // server-side trouble: stop and let the next flush retry
    }
  } finally {
    flushing = false;
  }

  return { sent, failed, remaining: (await listQueued()).length };
}

async function describeError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string') {
      return (body as { message: string }).message;
    }
  } catch {
    // non-JSON error body
  }
  return `Request failed (${response.status})`;
}

/** Starts replaying whenever the browser regains connectivity. Safe to call more than once. */
let listenerAttached = false;
export function startOutboxAutoFlush(): void {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  window.addEventListener('online', () => void flushOutbox());
  // `online` doesn't fire if the app was launched while already connected
  // with items left over from a previous session.
  if (navigator.onLine) void flushOutbox();
}

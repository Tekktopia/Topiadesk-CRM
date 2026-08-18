'use client';

import * as React from 'react';
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@topiadesk/ui';
import { MAX_ATTEMPTS, flushOutbox, listQueued, onOutboxChanged, removeItem, startOutboxAutoFlush, type OutboxItem } from '@/lib/offline/outbox';

/**
 * Connectivity + pending-writes indicator for the installed PWA.
 *
 * Without this, an offline write is invisible: apiFetch queues it and
 * throws OfflineQueuedError, and the agent has no way to know whether
 * anything is still waiting to reach the server — which is precisely the
 * anxiety that makes people re-enter the same record twice.
 *
 * Renders nothing when online with an empty queue, so it costs a normal
 * desk user nothing.
 */
export function OfflineStatus(): React.ReactElement | null {
  const [online, setOnline] = React.useState(true);
  const [items, setItems] = React.useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = React.useState(false);

  const refresh = React.useCallback(() => {
    void listQueued().then(setItems);
  }, []);

  React.useEffect(() => {
    // Initial state is read in an effect, never during render: `navigator`
    // doesn't exist during SSR, and seeding state from it would produce a
    // hydration mismatch on every page.
    setOnline(navigator.onLine);
    refresh();
    startOutboxAutoFlush();

    const goOnline = () => {
      setOnline(true);
      refresh();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const unsubscribe = onOutboxChanged(refresh);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsubscribe();
    };
  }, [refresh]);

  const syncNow = React.useCallback(async () => {
    setSyncing(true);
    try {
      await flushOutbox();
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh]);

  const failed = items.filter((i) => i.attempts >= MAX_ATTEMPTS);
  const pending = items.filter((i) => i.attempts < MAX_ATTEMPTS);

  if (online && items.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto rounded-lg border bg-card p-3 shadow-lg"
    >
      {!online ? (
        <p className="flex items-center gap-2 text-sm font-medium">
          <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
          You&apos;re offline — changes are saved on this device.
        </p>
      ) : null}

      {pending.length > 0 ? (
        <div className={online ? '' : 'mt-2'}>
          <p className="text-sm">
            {pending.length} change{pending.length === 1 ? '' : 's'} waiting to sync
            {online ? '' : ' when you reconnect'}.
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {pending.slice(0, 4).map((item) => (
              <li key={item.id}>• {item.label}</li>
            ))}
            {pending.length > 4 ? <li>• and {pending.length - 4} more</li> : null}
          </ul>
          {online ? (
            <Button size="sm" variant="secondary" className="mt-2 gap-1.5" onClick={syncNow} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="mt-2 border-t pt-2">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {failed.length} change{failed.length === 1 ? '' : 's'} couldn&apos;t be saved
          </p>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            {failed.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  {item.label}
                  {item.lastError ? <span className="block text-xs">{item.lastError}</span> : null}
                </span>
                {/* Discarding is the only safe automatic option: the server
                    rejected this write on its merits, so re-sending it
                    unchanged cannot succeed, and silently dropping it would
                    lose work the user believes they saved. */}
                <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-xs" onClick={() => void removeItem(item.id)}>
                  Discard
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

import { WifiOff } from 'lucide-react';

/**
 * Precached at service-worker install time (see public/sw.js's
 * APP_SHELL_URLS) and served in place of any navigation the SW can't reach
 * over the network. Deliberately outside every route group — it must render
 * with zero data fetching (no auth check, no tenant lookup), since being
 * shown here means the network that those would depend on is already gone.
 *
 * The reload-on-reconnect behavior below is a raw inline <script>, not a
 * React client component: `caches.addAll` at SW install time only fetches
 * this page's HTML document, not its content-hashed Next.js JS chunk — a
 * separate `'use client'` component would 404 under a genuinely offline
 * first load (confirmed live: the chunk request fails with
 * net::ERR_INTERNET_DISCONNECTED). Plain synchronous script text ships
 * inside the already-cached HTML itself, so it runs with no extra request.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: "window.addEventListener('online', function () { window.location.reload(); });",
        }}
      />
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold text-foreground">You&apos;re offline</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          TopiaDesk can&apos;t reach the network right now. Check your connection — this page will reload automatically once
          you&apos;re back online.
        </p>
      </div>
    </main>
  );
}

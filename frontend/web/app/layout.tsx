import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
import { Providers } from './providers';
import { InstallPrompt } from './install-prompt';
import { OfflineStatus } from './offline-status';
import { ServiceWorkerRegistration } from './service-worker-registration';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TopiaDesk CRM',
    template: '%s · TopiaDesk CRM',
  },
  description: 'TopiaDesk CRM — the engagement layer for Scib Nigeria insurance brokerage operations.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  // iOS ignores the web manifest's `display` field entirely — without these
  // apple-specific tags, "Add to Home Screen" on iPhone produces a bookmark
  // that opens in a Safari tab with browser chrome, not a standalone app.
  // `statusBarStyle: 'default'` keeps the status bar legible against the
  // light background; 'black-translucent' would let content slide under it.
  appleWebApp: {
    capable: true,
    title: 'TopiaDesk',
    statusBarStyle: 'default',
  },
};

// Next 15 splits viewport-affecting metadata (themeColor, among others) out
// of `metadata` into its own export — this is what puts a matching color in
// the OS status bar / task switcher once the app is installed as a PWA.
export const viewport: Viewport = {
  themeColor: '#147bc6',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning is required by next-themes: it sets the
    // `dark`/`light` class on <html> via an inline script before React
    // hydrates, which would otherwise trigger a (harmless but noisy)
    // server/client mismatch warning on this element specifically.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <ServiceWorkerRegistration />
        {/* One positioned stack rather than two independently-fixed cards —
            both are bottom-anchored and would otherwise sit on top of each
            other, hiding whichever lost the z-index. `pointer-events-none`
            on the container keeps the empty gutter from swallowing clicks
            on the page beneath; each card re-enables them for itself. */}
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-96">
          <OfflineStatus />
          <InstallPrompt />
        </div>
      </body>
    </html>
  );
}

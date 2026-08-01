import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { dashboardNav } from './(dashboard)/nav';
// Batch 2: once app/(crm)/nav.ts, app/(policy)/nav.ts, app/(admin)/nav.ts
// exist, import each here and add it to the `nav` array below — that's the
// only change this shared file needs per route group. See
// lib/nav-types.ts and app/(dashboard)/nav.ts for the full pattern.
import { AppHeader } from './app-header';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TopiaDesk CRM',
    template: '%s · TopiaDesk CRM',
  },
  description: 'TopiaDesk CRM — the engagement layer for Scib Nigeria insurance brokerage operations.',
};

const nav = [...dashboardNav];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning is required by next-themes: it sets the
    // `dark`/`light` class on <html> via an inline script before React
    // hydrates, which would otherwise trigger a (harmless but noisy)
    // server/client mismatch warning on this element specifically.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>
          <div className="flex min-h-screen">
            <AppSidebar nav={nav} />
            <div className="flex min-w-0 flex-1 flex-col">
              <AppHeader />
              <main className="flex-1 p-6">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}

/** Minimal server-rendered sidebar shell — Batch 2 can replace this with a
 * richer composite (collapsible sections, active-route highlighting,
 * per-role visibility) without touching how `nav` is assembled above. */
function AppSidebar({ nav }: { nav: typeof dashboardNav }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-sm font-semibold tracking-tight text-foreground">TopiaDesk CRM</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

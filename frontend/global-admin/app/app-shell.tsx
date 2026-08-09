'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn, Skeleton } from '@topiadesk/ui';
import { NAV_ITEMS, isNavItemActive } from '@/lib/nav';
import { useCurrentPlatformAdmin } from '@/lib/auth/use-current-platform-admin';
import { AccountMenu } from './account-menu';
import { AppHeader } from './app-header';

/**
 * Single-tier left sidebar (icon + label per row) — see this session's
 * plan for why this, not frontend/web's two-tier icon-rail+panel shell:
 * every item below is one destination, not a module with its own
 * sub-pages, so a second tier would be empty chrome.
 *
 * Genuinely pinned now (sticky + h-screen on the aside, its own
 * overflow-y-auto) — previously just in-flow flex, which only looked
 * fixed at typical viewport heights. Glass surface (bg-card/NN + blur)
 * rather than <Card>, since Card's wrapper hardcodes full-opacity
 * bg-card with no className escape hatch for that div.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { admin, isLoading } = useCurrentPlatformAdmin();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-card/40 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-2.5 border-b border-white/5 px-5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary shadow-glow-primary" />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">TopiaDesk</span>
            <span className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Global Admin</span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 border-l-2 px-3 py-2 text-sm font-medium transition-all',
                  active
                    ? 'border-primary bg-primary/10 text-primary shadow-glow-primary'
                    : 'border-transparent text-muted-foreground hover:border-white/10 hover:bg-white/[0.03] hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
                    active ? 'bg-primary/15 text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-2">
          {isLoading ? <Skeleton className="h-11 w-full" /> : admin ? <AccountMenu admin={admin} /> : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="relative flex-1 overflow-y-auto bg-dot-grid p-6 md:p-8">
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_20%_-10%,hsl(var(--primary)/0.08),transparent),radial-gradient(ellipse_60%_40%_at_100%_10%,hsl(var(--accent)/0.06),transparent)]"
          />
          {children}
        </main>
      </div>
    </div>
  );
}

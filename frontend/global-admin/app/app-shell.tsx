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
 * sub-pages, so a second tier would be empty chrome. Replaces the
 * previous flat top-nav (3 items, no sidebar at all).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { admin, isLoading } = useCurrentPlatformAdmin();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <span className="text-sm font-semibold tracking-tight">TopiaDesk</span>
          <span className="text-sm text-muted-foreground">Global Admin</span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-2">
          {isLoading ? <Skeleton className="h-11 w-full" /> : admin ? <AccountMenu admin={admin} /> : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}

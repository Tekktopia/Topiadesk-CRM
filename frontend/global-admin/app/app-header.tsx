'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button, Skeleton } from '@topiadesk/ui';
import { useCurrentPlatformAdmin } from '@/lib/auth/use-current-platform-admin';
import { NAV_ITEMS } from '@/lib/nav';
import { AccountMenu } from './account-menu';

function Breadcrumb() {
  const pathname = usePathname();
  const activeItem = NAV_ITEMS.find((item) => (item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`)));

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <Link href="/" className="flex shrink-0 items-center rounded p-1 hover:bg-secondary hover:text-foreground" aria-label="Dashboard">
        <Home className="h-4 w-4" aria-hidden />
      </Link>
      {activeItem && activeItem.href !== '/' ? (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate font-medium text-foreground">{activeItem.label}</span>
        </>
      ) : null}
    </nav>
  );
}

/**
 * Persistent top bar — the fix for "no place to login or logout": the
 * account slot at the right is the ONLY place in the app that renders a
 * three-way state (loading skeleton / signed-in chip / a visible "Sign
 * in" button), unlike app-shell.tsx's sidebar slot which previously
 * rendered nothing at all when `admin` was null. Structurally mirrors
 * frontend/web/app/app-header.tsx, minus CommandPalette/NotificationBell/
 * QuickCreateMenu/KeyboardShortcutsDialog — none of those have a backend
 * surface for platform admins, so they're not invented here.
 */
export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const { admin, isLoading } = useCurrentPlatformAdmin();

  return (
    <header className="flex h-11 items-center justify-between gap-4 bg-background/95 px-4 shadow-[0_2px_6px_-1px_hsl(var(--foreground)/0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Breadcrumb />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          <Sun className="hidden h-4 w-4 dark:block" />
          <Moon className="block h-4 w-4 dark:hidden" />
        </Button>

        {isLoading ? (
          <Skeleton className="h-7 w-7 rounded-none" />
        ) : admin ? (
          <AccountMenu admin={admin} trigger="chip" side="bottom" />
        ) : (
          <Button asChild size="sm">
            <a href="/api/auth/login">Sign in</a>
          </Button>
        )}
      </div>
    </header>
  );
}

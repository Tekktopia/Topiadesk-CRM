'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronRight, Circle, Home, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Skeleton } from '@topiadesk/ui';
import { useCurrentPlatformAdmin } from '@/lib/auth/use-current-platform-admin';
import { NAV_ITEMS } from '@/lib/nav';
import { apiFetch } from './_lib/api';
import type { PlatformNotification } from './_lib/types';
import { AccountMenu } from './account-menu';
import { CommandPalette } from './command-palette';

function Breadcrumb() {
  const pathname = usePathname();
  const activeItem = NAV_ITEMS.find((item) => (item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`)));

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <Link href="/" className="flex shrink-0 items-center rounded-md p-1.5 hover:bg-white/[0.06] hover:text-primary" aria-label="Dashboard">
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

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Ported from frontend/web/app/app-header.tsx's NotificationBell, backed
 * by backend/api/src/modules/platform/notifications.controller.ts —
 * broadcast to every platform admin with a SHARED read state (see
 * PlatformNotification's schema doc comment for why), so there's no
 * "mine" filtering the way the tenant-facing version has. Two differences
 * from the web version: uses this app's apiFetch (throws ApiError on a
 * non-2xx response) instead of a raw fetch/res.ok check, and guards
 * `n.body` as nullable since this schema's body column is optional where
 * the tenant-facing NotificationRow's isn't.
 */
function NotificationBell() {
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ['platform-notifications'],
    queryFn: () => apiFetch<PlatformNotification[]>('/api/notifications'),
    refetchInterval: 60_000,
  });
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-notifications'] }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-white/[0.06] hover:text-primary"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none shadow-glow-destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => {
                  if (!n.readAt) markRead.mutate(n.id);
                }}
                className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
              >
                <div className="flex w-full items-center gap-2">
                  {!n.readAt ? <Circle className="h-1.5 w-1.5 shrink-0 fill-accent text-accent" aria-hidden /> : null}
                  <span className={`text-sm ${n.readAt ? 'text-muted-foreground' : 'font-medium'}`}>{n.title}</span>
                </div>
                {n.body ? <span className="line-clamp-2 pl-3.5 text-xs text-muted-foreground">{n.body}</span> : null}
                <span className="pl-3.5 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Persistent top bar — the fix for "no place to login or logout": the
 * account slot at the right is the ONLY place in the app that renders a
 * three-way state (loading skeleton / signed-in chip / a visible "Sign
 * in" button), unlike app-shell.tsx's sidebar slot which previously
 * rendered nothing at all when `admin` was null. Structurally mirrors
 * frontend/web/app/app-header.tsx, including NotificationBell and now
 * CommandPalette (both have a real backend surface — see
 * notifications.controller.ts / platform-search.controller.ts) — minus
 * QuickCreateMenu/KeyboardShortcutsDialog, which still don't.
 */
export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const { admin, isLoading } = useCurrentPlatformAdmin();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-white/5 bg-background/70 px-6 backdrop-blur-xl">
      <Breadcrumb />

      {admin ? (
        <div className="hidden max-w-md flex-1 md:block">
          <CommandPalette />
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        {admin ? <NotificationBell /> : null}

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          className="hover:bg-white/[0.06] hover:text-primary"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
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

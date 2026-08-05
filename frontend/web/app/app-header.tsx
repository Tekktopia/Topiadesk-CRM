'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Briefcase, Building2, ChevronRight, Circle, Home, LifeBuoy, LogOut, Moon, Plus, Sun, User as UserIcon, UserPlus } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { activeNavItem, activeNavModule } from './nav-modules';
import { CommandPalette } from './command-palette';

function Breadcrumb() {
  const pathname = usePathname();
  const mod = activeNavModule(pathname);
  const item = activeNavItem(pathname, mod);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <Link href="/" className="flex shrink-0 items-center rounded p-1 hover:bg-secondary hover:text-foreground" aria-label="Dashboard">
        <Home className="h-4 w-4" aria-hidden />
      </Link>
      <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate font-medium text-foreground">{item && item.label !== mod.label ? item.label : mod.label}</span>
    </nav>
  );
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
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

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  status: string;
  readAt: string | null;
  createdAt: string;
}

const QUICK_CREATE_ITEMS = [
  { label: 'Account', href: '/accounts?new=1', icon: Building2 },
  { label: 'Lead', href: '/leads?new=1', icon: UserPlus },
  { label: 'Case', href: '/cases?new=1', icon: LifeBuoy },
  { label: 'Policy', href: '/policies', icon: Briefcase },
] as const;

const PRESENCE_OPTIONS = [
  { value: 'ONLINE', label: 'Online', dotClass: 'fill-emerald-500 text-emerald-500' },
  { value: 'AWAY', label: 'Away', dotClass: 'fill-amber-500 text-amber-500' },
  { value: 'OFFLINE', label: 'Offline', dotClass: 'fill-muted-foreground text-muted-foreground' },
] as const;

function QuickCreateMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Quick create">
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Create new</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {QUICK_CREATE_ITEMS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} className="flex w-full cursor-pointer items-center gap-2">
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PresenceMenu({ presenceStatus }: { presenceStatus: 'ONLINE' | 'AWAY' | 'OFFLINE' }) {
  const queryClient = useQueryClient();
  const current = PRESENCE_OPTIONS.find((o) => o.value === presenceStatus) ?? PRESENCE_OPTIONS[2];

  const setPresence = useMutation({
    mutationFn: (value: 'ONLINE' | 'AWAY' | 'OFFLINE') =>
      fetch('/api/auth/presence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presenceStatus: value }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2" aria-label="Set your status">
          <Circle className={`h-2.5 w-2.5 ${current.dotClass}`} aria-hidden />
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{current.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Your status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRESENCE_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => setPresence.mutate(option.value)} className="flex items-center gap-2">
            <Circle className={`h-2.5 w-2.5 ${option.dotClass}`} aria-hidden />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBell() {
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', 'mine'],
    queryFn: async (): Promise<NotificationRow[]> => {
      const res = await fetch('/api/notifications');
      if (!res.ok) return [];
      return (await res.json()) as NotificationRow[];
    },
    refetchInterval: 60_000,
  });
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const markRead = useMutation({
    mutationFn: (id: string) => fetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'mine'] }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}>
          <Bell className="h-4 w-4" aria-hidden />
          {unreadCount > 0 ? (
            <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none">
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
                <span className="line-clamp-2 pl-3.5 text-xs text-muted-foreground">{n.body}</span>
                <span className="pl-3.5 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Persistent top bar: global search, quick-create, presence status, live
 * notification feed, theme toggle, and the current-user menu. */
export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, isLoading } = useCurrentUser();

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-6">
      <Breadcrumb />

      <div className="hidden max-w-md flex-1 md:block">
        <CommandPalette />
      </div>

      <div className="flex items-center gap-1">
        {user ? <QuickCreateMenu /> : null}
        {user ? <NotificationBell /> : null}
        {user ? <PresenceMenu presenceStatus={user.presenceStatus} /> : null}

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="hidden h-4 w-4 dark:block" />
          <Moon className="block h-4 w-4 dark:hidden" />
        </Button>

        {isLoading ? (
          <Skeleton className="h-8 w-8 rounded-full" />
        ) : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.fullName}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex w-full cursor-pointer items-center gap-2">
                  <UserIcon className="h-4 w-4" aria-hidden />
                  My profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/api/auth/logout" className="flex w-full cursor-pointer items-center gap-2">
                  <LogOut className="h-4 w-4" aria-hidden />
                  Log out
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild size="sm">
            <a href="/api/auth/login">Sign in</a>
          </Button>
        )}
      </div>
    </header>
  );
}

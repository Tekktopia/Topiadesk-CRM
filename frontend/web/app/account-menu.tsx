'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { Circle, Keyboard, LifeBuoy, LogOut, Monitor, Moon, Palette, Settings, Sun } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@topiadesk/ui';
import { openKeyboardShortcuts } from './keyboard-shortcuts-dialog';
import { csrfHeaders } from '@/lib/csrf';

interface HeaderUser {
  fullName: string;
  email: string;
  roles: string[];
  presenceStatus: 'ONLINE' | 'AWAY' | 'OFFLINE';
  hasAvatar: boolean;
}

export const PRESENCE_OPTIONS = [
  { value: 'ONLINE', label: 'Online', dotClass: 'fill-emerald-500 text-emerald-500', ringClass: 'ring-emerald-500' },
  { value: 'AWAY', label: 'Away', dotClass: 'fill-amber-500 text-amber-500', ringClass: 'ring-amber-500' },
  { value: 'OFFLINE', label: 'Offline', dotClass: 'fill-muted-foreground text-muted-foreground', ringClass: 'ring-border' },
] as const;

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** "ACCOUNT_HANDLER" -> "Account Handler" — role names are stored as
 * seed-managed identifiers (packages/db/prisma/seed.ts), never a display
 * string, so every surface that shows one humanizes it locally. */
function humanizeRole(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Shared by the account menu's inline status switcher — any authenticated
 * user may set their own presence, same self-scoped-to-own-id shape as
 * PATCH /identity/me/presence itself. */
function useSetPresence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: 'ONLINE' | 'AWAY' | 'OFFLINE') =>
      fetch('/api/auth/presence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('PATCH') },
        body: JSON.stringify({ presenceStatus: value }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] }),
  });
}

/** Cache-bust key for the avatar `<img>` — bumped by the profile page after
 * a successful upload/removal so every consumer (header chip, sidebar
 * icon, profile page itself) picks up the new picture without a full
 * reload, while normal navigation reuses the browser's own cache
 * (GET /identity/me/avatar sets a private max-age). A plain module-level
 * counter works here (not React state) because every reader is only ever
 * rendered from a `user` object sourced from useCurrentUser() — the
 * `queryClient.invalidateQueries()` call every mutation already makes
 * right after bumping this is what actually triggers the re-render; this
 * counter just needs to hold the new value by the time that re-render
 * happens, which the synchronous increment-before-invalidate ordering
 * guarantees. */
let avatarCacheBust = 0;
export function bumpAvatarCacheBust(): void {
  avatarCacheBust += 1;
}
export function getAvatarCacheBust(): number {
  return avatarCacheBust;
}

/**
 * Tells the service worker to drop the offline page/API caches before the
 * browser follows the sign-out link. Those caches hold this user's
 * authenticated documents and API responses (see public/sw.js's own
 * PURGE_SESSION_CACHES comment) and previously survived logout entirely,
 * so on a shared phone the next person could open the installed PWA
 * offline and read them.
 *
 * Deliberately fire-and-forget rather than awaited-then-navigate: the
 * anchor's normal navigation must not be blocked or cancelled, since
 * failing to sign out is far worse than a cache that outlives the session
 * by a moment. postMessage is synchronous enough to reach an active worker
 * before unload in practice, and the server-side session teardown is what
 * actually ends the session either way.
 */
function purgeOfflineCachesBeforeSignOut(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'PURGE_SESSION_CACHES' });
  } catch {
    // No SW support, or no active controller — nothing cached to purge.
  }
}

function AccountAvatar({ user, className }: { user: HeaderUser; className?: string }) {
  const presence = PRESENCE_OPTIONS.find((o) => o.value === user.presenceStatus) ?? PRESENCE_OPTIONS[2];
  return (
    <Avatar className={cn(`ring-2 ring-offset-2 ring-offset-background ${presence.ringClass}`, className)}>
      {user.hasAvatar ? <AvatarImage src={`/api/auth/avatar?v=${avatarCacheBust}`} alt="" /> : null}
      <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * The current-user menu — a profile card (avatar/name/email/role badges),
 * an inline status switcher, then account actions. Used both in the top
 * header (a "chip" trigger: avatar + name, so the signed-in user is
 * legible at a glance) and at the bottom of the sidebar's icon rail (an
 * "icon"-only trigger, matching that rail's narrow width) — same dropdown
 * content either way, just a different trigger shape/anchor side.
 */
export function AccountMenu({
  user,
  trigger = 'icon',
  side = 'bottom',
}: {
  user: HeaderUser;
  trigger?: 'icon' | 'chip';
  side?: 'bottom' | 'right';
}) {
  const setPresence = useSetPresence();
  const presence = PRESENCE_OPTIONS.find((o) => o.value === user.presenceStatus) ?? PRESENCE_OPTIONS[2];
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === 'chip' ? (
          <Button variant="ghost" className="h-9 gap-2 rounded-none pl-1.5 pr-3" aria-label="Account menu">
            <AccountAvatar user={user} className="h-7 w-7 text-xs" />
            <span className="max-w-[140px] truncate text-sm font-medium text-foreground">{user.fullName}</span>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="rounded-none" aria-label="Account menu">
            <AccountAvatar user={user} className="h-9 w-9" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className="w-64 overflow-hidden p-0">
        <div className="flex items-center gap-3 bg-secondary/40 p-4">
          <AccountAvatar user={user} className="h-11 w-11 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>

        {user.roles.length > 0 ? (
          <div className="flex flex-wrap gap-1 px-4 pb-3 pt-3">
            {user.roles.map((role) => (
              <Badge key={role} variant="outline" className="text-[10px] font-medium">
                {humanizeRole(role)}
              </Badge>
            ))}
          </div>
        ) : null}

        <DropdownMenuSeparator className="mx-0 my-0" />

        <div className="p-2">
          <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Status</p>
          <div className="grid grid-cols-3 gap-1">
            {PRESENCE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPresence.mutate(option.value)}
                aria-pressed={option.value === presence.value}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors',
                  option.value === presence.value
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                <Circle className={`h-2 w-2 ${option.dotClass}`} aria-hidden />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <DropdownMenuSeparator className="mx-0 my-0" />

        <div className="p-1">
          <DropdownMenuItem onSelect={() => openKeyboardShortcuts()} className="cursor-pointer gap-2">
            <Keyboard className="h-4 w-4" aria-hidden />
            Keyboard shortcuts
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/profile" className="flex w-full cursor-pointer items-center gap-2">
              <Settings className="h-4 w-4" aria-hidden />
              Profile settings
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/support" className="flex w-full cursor-pointer items-center gap-2">
              <LifeBuoy className="h-4 w-4" aria-hidden />
              Contact support
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Palette className="h-4 w-4" aria-hidden />
              Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light" className="gap-2">
                  <Sun className="h-3.5 w-3.5" aria-hidden />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark" className="gap-2">
                  <Moon className="h-3.5 w-3.5" aria-hidden />
                  Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system" className="gap-2">
                  <Monitor className="h-3.5 w-3.5" aria-hidden />
                  System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </div>

        <DropdownMenuSeparator className="mx-0 my-0" />

        <div className="p-1">
          <DropdownMenuItem asChild>
            <a
              href="/api/auth/logout"
              onClick={purgeOfflineCachesBeforeSignOut}
              className="flex w-full cursor-pointer items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </a>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

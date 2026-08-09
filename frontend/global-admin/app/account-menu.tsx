'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { LogOut, Monitor, Moon, Palette, Sun, User as UserIcon } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@topiadesk/ui';
import type { PlatformAdminUser } from '@/lib/auth/types';

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Global Admin's own account menu — same profile-card + theme + sign-out
 * shape as frontend/web's AccountMenu, trimmed for PlatformAdminUser's
 * thinner shape ({id, email, fullName} — no roles/presence, since every
 * platform admin has equal, flat access today). `trigger`/`side` mirror
 * frontend/web's AccountMenu props exactly: a "chip" (avatar + name) for
 * the top header bar, an "icon"-only trigger for the sidebar's narrow
 * bottom slot — same dropdown content either way.
 */
export function AccountMenu({ admin, trigger = 'icon', side = 'right' }: { admin: PlatformAdminUser; trigger?: 'icon' | 'chip'; side?: 'bottom' | 'right' }) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === 'chip' ? (
          <Button variant="ghost" className="h-9 gap-2 rounded-none pl-1.5 pr-3" aria-label="Account menu">
            <Avatar className="h-7 w-7 text-xs">
              <AvatarFallback>{initials(admin.fullName)}</AvatarFallback>
            </Avatar>
            <span className="max-w-[140px] truncate text-sm font-medium text-foreground">{admin.fullName}</span>
          </Button>
        ) : (
          <Button variant="ghost" className="h-auto w-full justify-start gap-2 px-2 py-2" aria-label="Account menu">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs">{initials(admin.fullName)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground">{admin.fullName}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={trigger === 'chip' ? 'end' : 'start'} side={side} className="w-64 overflow-hidden p-0">
        <div className="flex items-center gap-3 bg-secondary/40 p-4">
          <Avatar className="h-11 w-11 text-sm">
            <AvatarFallback>{initials(admin.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{admin.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 px-4 pb-3 pt-3">
          <Badge variant="outline" className="text-[10px] font-medium">
            Platform Admin
          </Badge>
        </div>

        <DropdownMenuSeparator className="mx-0 my-0" />

        <div className="p-1">
          <DropdownMenuItem asChild>
            <Link href="/profile" className="flex w-full cursor-pointer items-center gap-2">
              <UserIcon className="h-4 w-4" aria-hidden />
              My profile
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
            <a href="/api/auth/logout" className="flex w-full cursor-pointer items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive">
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </a>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

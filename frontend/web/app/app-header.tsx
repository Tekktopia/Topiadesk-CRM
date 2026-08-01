'use client';

import { LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  Avatar,
  AvatarFallback,
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

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Persistent top bar — theme toggle + current-user menu. The working
 * example for how Batch 2 pages consume `useCurrentUser()` and the
 * primitives it's built from (Avatar/DropdownMenu/Button). */
export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, isLoading } = useCurrentUser();

  return (
    <header className="flex h-14 items-center justify-end gap-2 border-b border-border px-6">
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
    </header>
  );
}

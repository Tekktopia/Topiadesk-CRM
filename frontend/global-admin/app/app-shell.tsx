'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Building2, LayoutDashboard, LogOut, Package } from 'lucide-react';
import { cn } from '@topiadesk/ui';
import { useCurrentPlatformAdmin } from '@/lib/auth/use-current-platform-admin';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tenants', label: 'Tenants', icon: Building2 },
  { href: '/plans', label: 'Plans', icon: Package },
];

/**
 * Simple top-nav shell — Global Admin's page surface is small (dashboard +
 * tenants + plans), so a full sidebar like frontend/web's AppSidebar would
 * be more chrome than content. Every route below is already behind
 * middleware.ts's session gate, so there is no "public path" branch to
 * handle here the way frontend/web's AppShell does.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { admin } = useCurrentPlatformAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
        <div className="flex items-center gap-8">
          <span className="text-sm font-semibold tracking-tight">TopiaDesk Global Admin</span>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {admin ? <span className="text-sm text-muted-foreground">{admin.fullName}</span> : null}
          <a href="/api/auth/logout" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
            Sign out
          </a>
        </div>
      </header>
      <main className="flex-1 bg-muted/30 p-6">{children}</main>
    </div>
  );
}

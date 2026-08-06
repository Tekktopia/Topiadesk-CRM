'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@topiadesk/ui';
import { cn } from '@topiadesk/ui';
import { usePortalMe } from '../_lib/queries';

const LINKS = [
  { href: '/portal', label: 'Overview' },
  { href: '/portal/policies', label: 'Policies' },
  { href: '/portal/documents', label: 'Documents' },
  { href: '/portal/cases', label: 'Support' },
];

/** Top bar for every authenticated /portal/* page — a customer Contact's
 * entire nav surface, deliberately tiny (4 links + logout) next to the
 * internal AppSidebar's module list, since this audience only ever needs
 * their own account's data. */
export function PortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const meQuery = usePortalMe();

  async function handleLogout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' });
    router.push('/portal/login');
    router.refresh();
  }

  return (
    <div className="mb-6 space-y-4 border-b border-border pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer Portal</p>
          <h1 className="text-lg font-semibold text-foreground">
            {meQuery.data ? meQuery.data.accountName : ' '}
          </h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void handleLogout()} className="gap-1.5">
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </Button>
      </div>
      <nav className="flex flex-wrap gap-1">
        {LINKS.map((link) => {
          const active = link.href === '/portal' ? pathname === '/portal' : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-none px-3 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

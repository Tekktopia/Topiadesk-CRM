'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';

/**
 * Route prefixes reached by anonymous external visitors with no
 * `td_session` cookie (see middleware.ts's matcher, which excludes these
 * same prefixes from the login redirect). The internal AppSidebar/AppHeader
 * shell assumes a signed-in staff member — module nav, presence, quick
 * create, notifications — none of which make sense (and shouldn't be
 * exposed) to a customer looking up a policy FAQ or submitting a survey
 * response. Keep this list in sync with middleware.ts's `config.matcher`.
 * `/portal` has its own minimal shell (app/(portal)/portal/layout.tsx), not
 * this one or the internal sidebar. `/` (exact root, matched via the
 * `pathname === prefix` branch below — `''.startsWith('//')` never matches
 * a real path, so this can't accidentally swallow every route) is
 * app/page.tsx, the entry chooser; middleware.ts already redirects any
 * authenticated visitor away from it before this ever renders, so in
 * practice only an anonymous visitor reaches this branch for "/".
 */
const PUBLIC_PATH_PREFIXES = ['/survey-respond', '/kb', '/portal', '/'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isPublicPath(pathname)) {
    return <main className="flex-1 p-6">{children}</main>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4">{children}</main>
      </div>
    </div>
  );
}

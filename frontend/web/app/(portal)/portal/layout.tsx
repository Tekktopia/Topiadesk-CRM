import type { ReactNode } from 'react';

/**
 * Minimal shell for the customer self-service portal — no CRM/Tickets/
 * Policy sidebar. app/app-shell.tsx already renders this whole route group
 * shell-free (its PUBLIC_PATH_PREFIXES includes '/portal'), so this layout
 * only adds the portal's own light chrome (a centered column) on top of
 * that bare `<main>`.
 *
 * Applies to every /portal/* route including login/ and auth/[token]/,
 * which run with no portal session yet — auth gating happens per-page via
 * requirePortalSession() (lib/portal-auth/session.ts), not here, and the
 * authenticated nav bar (PortalNav) is rendered by each protected page
 * itself rather than here, so login/auth pages don't show it.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-screen max-w-2xl px-4 py-8">{children}</div>;
}

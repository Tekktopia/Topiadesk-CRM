import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TopiaDesk CRM',
    template: '%s · TopiaDesk CRM',
  },
  description: 'TopiaDesk CRM — the engagement layer for Scib Nigeria insurance brokerage operations.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning is required by next-themes: it sets the
    // `dark`/`light` class on <html> via an inline script before React
    // hydrates, which would otherwise trigger a (harmless but noisy)
    // server/client mismatch warning on this element specifically.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

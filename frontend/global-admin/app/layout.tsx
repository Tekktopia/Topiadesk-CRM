import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TopiaDesk Global Admin',
    template: '%s · TopiaDesk Global Admin',
  },
  description: 'Tenant provisioning and subscription management for the TopiaDesk platform.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

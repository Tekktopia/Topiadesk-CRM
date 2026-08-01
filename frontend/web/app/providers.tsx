'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { Toaster, TooltipProvider } from '@topiadesk/ui';

/**
 * Root providers wrapper — everything here is Batch-2-consumed, not
 * Batch-2-owned: CRM/Policy/Admin route groups render inside this tree via
 * the root layout and get TanStack Query + theme + toast + tooltip context
 * for free, without needing their own provider setup.
 *
 * `next-themes`'s `ThemeProvider` (not a hand-rolled equivalent) because it
 * solves the classic dark-mode flash-of-wrong-theme problem correctly: it
 * injects a tiny blocking inline script that sets the `dark` class on
 * `<html>` before React hydrates, reading `localStorage` first and falling
 * back to `prefers-color-scheme` — exactly "respect OS preference AND
 * allow manual override" from the design brief, without a hand-rolled
 * flash-of-incorrect-theme workaround.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="top-right" closeButton richColors />
        </TooltipProvider>
        {process.env.NODE_ENV === 'development' ? <ReactQueryDevtools initialIsOpen={false} /> : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}

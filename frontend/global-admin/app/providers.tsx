'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster, TooltipProvider } from '@topiadesk/ui';

/** Same shape as frontend/web/app/providers.tsx, trimmed to what this
 * smaller app actually needs (no devtools panel). */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              const status = error && typeof error === 'object' && 'status' in error ? (error as { status?: unknown }).status : undefined;
              if (typeof status === 'number' && status >= 400 && status < 500) return false;
              return failureCount < 3;
            },
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
      </QueryClientProvider>
    </ThemeProvider>
  );
}

'use client';

import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

/**
 * Toast primitive — uses `sonner` (not Radix Toast) per shadcn's current
 * recommendation: simpler API, built-in stacking/swipe-to-dismiss, and no
 * extra Radix viewport wiring. Reads the active theme from `next-themes`
 * (provided by apps/web's root `ThemeProvider`) so toasts always match the
 * app's light/dark mode instead of following OS preference independently.
 */
function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={(resolvedTheme as ToasterProps['theme']) ?? 'system'}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-brand-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
export { toast } from 'sonner';

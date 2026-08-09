import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Card, CardContent } from '@topiadesk/ui';

/** Shared "nothing to show" / "something went wrong" states for
 * query-driven module pages — copy of frontend/web's admin-section
 * EmptyState/ErrorState, with the 403-specific messaging dropped: every
 * platform admin has equal, flat access today (see account-menu.tsx's own
 * comment), so there's no per-page grant to explain. Plain
 * presentational, no hooks, so no 'use client' needed. */

export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <span className="text-muted-foreground">{icon ?? <Inbox className="h-8 w-8" aria-hidden />}</span>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load this page</p>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

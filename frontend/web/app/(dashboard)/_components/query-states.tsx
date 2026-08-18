import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Card, CardContent } from '@topiadesk/ui';

/** Shared "nothing to show" / "something went wrong" states, same per-route-group convention as (admin)/admin/_components/query-states.tsx — plain presentational, no hooks. No 403 branch here: unlike admin's copy, nothing in (dashboard)/ is @RequirePermission-gated. */

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
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load this</p>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

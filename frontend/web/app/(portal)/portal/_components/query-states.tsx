import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Card, CardContent } from '@topiadesk/ui';

/** Local copy of app/(knowledge)/_components/query-states.tsx's shape,
 * minus the 403 branch — a portal Contact never sees a permission-grant
 * error, only "not found" (every query is scoped to their own accountId
 * server-side, so a wrong id 404s, it doesn't 403). */

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <span className="text-muted-foreground">{icon ?? <Inbox className="h-8 w-8" aria-hidden />}</span>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
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

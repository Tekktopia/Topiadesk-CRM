import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import { Card, CardContent } from '@topiadesk/ui';
import { isApiErrorStatus } from '../_lib/api';

/** Shared "nothing to show" / "something went wrong" / "you can't see this"
 * states for query-driven knowledge-base pages — local copy of
 * app/(admin)/admin/_components/query-states.tsx's shape. Plain
 * presentational, no hooks, so no 'use client' needed despite being used
 * inside Client Component pages. */

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
  if (isApiErrorStatus(error, 403)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">You don&apos;t have access to this</p>
          <p className="max-w-md text-sm text-muted-foreground">
            This is enforced by the API itself (a permission grant, not just this page) — ask an administrator if you
            believe this is wrong.
          </p>
        </CardContent>
      </Card>
    );
  }
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

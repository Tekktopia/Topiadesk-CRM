import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import { Card, CardContent } from '@topiadesk/ui';
import { isApiErrorStatus } from '../_lib/api';

/** Shared "nothing to show" / "something went wrong" / "you can't see
 * this" states for query-driven admin pages — plain presentational, no
 * hooks, so no 'use client' needed despite being used inside Client
 * Component pages. */

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
  if (isApiErrorStatus(error, 403)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">You don&apos;t have access to this page</p>
          <p className="max-w-md text-sm text-muted-foreground">
            This section requires an Identity grant (ADMIN, or read-only for COMPLIANCE_OFFICER). Ask an
            administrator to grant access if you believe this is wrong — this is enforced by the API itself, not
            just the UI.
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

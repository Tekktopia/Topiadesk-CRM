'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../_lib/api';
import type { PlatformAuditLogEntry } from '../_lib/types';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A single entity's slice of the platform audit log — same data as the
 * top-level /audit-log page, scoped via entityType/entityId (already-
 * supported filter params). Used on both the tenant detail page's
 * Activity tab and the support ticket detail page. */
export function AuditActivityList({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', entityType, entityId],
    queryFn: () => apiFetch<PlatformAuditLogEntry[]>(`/api/audit-log?entityType=${entityType}&entityId=${entityId}`),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;

  return (
    <ol className="flex flex-col gap-3">
      {data.map((entry) => (
        <li key={entry.id} className="flex items-start justify-between gap-4 rounded-none border border-border bg-card p-3 text-sm">
          <div>
            <p className="font-mono text-xs">{entry.action}</p>
            <p className="text-xs text-muted-foreground">{entry.actorName ?? 'System'}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{formatTimestamp(entry.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}

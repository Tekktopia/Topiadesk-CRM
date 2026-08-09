'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, DataTableColumnHeader, type ColumnDef } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { PlatformAuditLogEntry } from '../_lib/types';
import { PageHeader } from '../_components/page-header';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDetail(detail: Record<string, unknown> | null): string {
  if (!detail || Object.keys(detail).length === 0) return '';
  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

/** Read-only — no create/edit/delete anywhere on this page, matching
 * platform-audit-log.controller.ts's own "read-only by design" posture. */
export default function AuditLogPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-audit-log'],
    queryFn: () => apiFetch<PlatformAuditLogEntry[]>('/api/audit-log'),
  });

  const columns = React.useMemo<ColumnDef<PlatformAuditLogEntry>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Timestamp" />,
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatTimestamp(row.original.createdAt)}</span>,
      },
      {
        accessorKey: 'actorName',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Actor" />,
        cell: ({ row }) => row.original.actorName ?? <span className="text-muted-foreground">System</span>,
      },
      {
        accessorKey: 'action',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Action" />,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
      },
      {
        accessorKey: 'entityType',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Entity" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.entityType} <span className="font-mono text-xs">{row.original.entityId}</span>
          </span>
        ),
      },
      {
        accessorKey: 'detail',
        header: 'Detail',
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDetail(row.original.detail)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Audit Log" description="Every mutating action taken from Global Admin, most recent first. Read-only." />

      <DataTable columns={columns} data={data ?? []} getRowId={(e) => e.id} isLoading={isLoading} emptyState={<p className="text-muted-foreground">No activity recorded yet.</p>} />
    </div>
  );
}

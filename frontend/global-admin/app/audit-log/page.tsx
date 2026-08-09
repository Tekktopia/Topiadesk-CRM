'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Button, DataTable, DataTableColumnHeader, Input, type ColumnDef } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { PlatformAuditLogEntry } from '../_lib/types';
import { PageHeader } from '../_components/page-header';
import { useDebounced } from '@/lib/use-debounced';

const PAGE_SIZE = 200;

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
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-audit-log', limit],
    queryFn: () => apiFetch<PlatformAuditLogEntry[]>(`/api/audit-log?limit=${limit}`),
  });

  const filtered = React.useMemo(() => {
    if (!debouncedSearch) return data ?? [];
    const q = debouncedSearch.toLowerCase();
    return (data ?? []).filter(
      (e) => e.action.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q) || (e.actorName ?? '').toLowerCase().includes(q),
    );
  }, [data, debouncedSearch]);

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
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Audit Log" description="Every mutating action taken from Global Admin, most recent first. Read-only." />

      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input placeholder="Search action, entity, or actor…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      <DataTable columns={columns} data={filtered} getRowId={(e) => e.id} isLoading={isLoading} emptyState={<p className="text-muted-foreground">No activity recorded yet.</p>} />

      {!isLoading && (data?.length ?? 0) >= limit && limit < 500 ? (
        <Button variant="outline" className="self-center" onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, 500))}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { cn, DataTable, DataTableColumnHeader, Input, type ColumnDef, type PaginationState } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { TenantAdminSummary } from '../_lib/types';
import { PageHeader } from '../_components/page-header';
import { HealthBadge } from '../_components/health-badge';
import { useDebounced } from '@/lib/use-debounced';

/** Reuses the same admin-summary data as the "Tenant Admins" page (one
 * backend call, two views) — this one leads with seat usage instead of
 * admin count. */
export default function UsagePage() {
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-admin-summary'],
    queryFn: () => apiFetch<TenantAdminSummary[]>('/api/tenants/admin-summary'),
  });

  const filtered = React.useMemo(() => {
    if (!debouncedSearch) return data ?? [];
    const q = debouncedSearch.toLowerCase();
    return (data ?? []).filter((t) => t.tenantName.toLowerCase().includes(q));
  }, [data, debouncedSearch]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [debouncedSearch]);

  const columns = React.useMemo<ColumnDef<TenantAdminSummary>[]>(
    () => [
      {
        accessorKey: 'tenantName',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Tenant" />,
        cell: ({ row }) => (
          <Link href={`/tenants/${row.original.tenantId}?tab=usage`} className="font-medium hover:underline">
            {row.original.tenantName}
          </Link>
        ),
      },
      {
        id: 'health',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Health" />,
        cell: ({ row }) => <HealthBadge health={row.original.health} reasons={row.original.healthReasons} />,
      },
      {
        id: 'seatUsage',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Seat usage" />,
        cell: ({ row }) => {
          const { totalUsers, seatLimit } = row.original;
          if (totalUsers < 0 || !seatLimit) return <span className="text-muted-foreground">—</span>;
          const atLimit = totalUsers >= seatLimit;
          return (
            <span className={cn('font-medium', atLimit && 'text-destructive')}>
              {totalUsers} / {seatLimit}
            </span>
          );
        },
      },
      {
        accessorKey: 'adminCount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Admins" />,
        cell: ({ row }) => (row.original.adminCount < 0 ? <span className="text-muted-foreground">—</span> : row.original.adminCount),
      },
    ],
    [],
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Usage & Monitoring" description="Health, seat usage, and support load for every active tenant. Open a tenant for the full breakdown." />

      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input placeholder="Search tenants…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(t) => t.tenantId}
        isLoading={isLoading}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={<p className="text-muted-foreground">No active tenants match your search.</p>}
      />
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { cn, DataTable, DataTableColumnHeader, type ColumnDef } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { TenantAdminSummary } from '../_lib/types';
import { PageHeader } from '../_components/page-header';

/** Reuses the same admin-summary data as the "Tenant Admins" page (one
 * backend call, two views) — this one leads with seat usage instead of
 * admin count. */
export default function UsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-admin-summary'],
    queryFn: () => apiFetch<TenantAdminSummary[]>('/api/tenants/admin-summary'),
  });

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
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Usage & Monitoring" description="Seat usage against each tenant's plan. Open a tenant for the full breakdown." />

      <DataTable columns={columns} data={data ?? []} getRowId={(t) => t.tenantId} isLoading={isLoading} emptyState={<p className="text-muted-foreground">No active tenants yet.</p>} />
    </div>
  );
}

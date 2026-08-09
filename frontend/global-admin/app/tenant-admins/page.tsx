'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DataTable, DataTableColumnHeader, type ColumnDef } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { TenantAdminSummary } from '../_lib/types';
import { PageHeader } from '../_components/page-header';

/** One row per ACTIVE tenant with its total/admin user counts — see each
 * tenant's own detail page (Admins tab) to actually manage those users
 * (create/reset-password/deactivate). This page is the "how many admins
 * does each tenant have" cross-tenant view the platform asked for. */
export default function TenantAdminsPage() {
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
          <Link href={`/tenants/${row.original.tenantId}?tab=admins`} className="font-medium hover:underline">
            {row.original.tenantName}
          </Link>
        ),
      },
      {
        accessorKey: 'adminCount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Admins" />,
        cell: ({ row }) => (row.original.adminCount < 0 ? <span className="text-muted-foreground">—</span> : row.original.adminCount),
      },
      {
        accessorKey: 'totalUsers',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Total users" />,
        cell: ({ row }) => (row.original.totalUsers < 0 ? <span className="text-muted-foreground">—</span> : row.original.totalUsers),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Tenant Admins" description="Admin and total user counts for every active tenant. Open a tenant to manage its admins." />

      <DataTable columns={columns} data={data ?? []} getRowId={(t) => t.tenantId} isLoading={isLoading} emptyState={<p className="text-muted-foreground">No active tenants yet.</p>} />
    </div>
  );
}

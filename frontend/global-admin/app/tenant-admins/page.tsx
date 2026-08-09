'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { DataTable, DataTableColumnHeader, Input, type ColumnDef, type PaginationState } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { TenantAdminSummary } from '../_lib/types';
import { PageHeader } from '../_components/page-header';
import { useDebounced } from '@/lib/use-debounced';

/** One row per ACTIVE tenant with its total/admin user counts — see each
 * tenant's own detail page (Admins tab) to actually manage those users
 * (create/reset-password/deactivate). This page is the "how many admins
 * does each tenant have" cross-tenant view the platform asked for. */
export default function TenantAdminsPage() {
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
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Tenant Admins" description="Admin and total user counts for every active tenant. Open a tenant to manage its admins." />

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

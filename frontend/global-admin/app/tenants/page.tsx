'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Search } from 'lucide-react';
import {
  Button,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
  type PaginationState,
  toast,
} from '@topiadesk/ui';
import { apiFetch, ApiError } from '../_lib/api';
import type { Tenant, TenantStatus } from '../_lib/types';
import { CreateTenantDialog } from './_create-tenant-dialog';
import { TenantStatusBadge } from './_status-badge';
import { PageHeader } from '../_components/page-header';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { useDebounced } from '@/lib/use-debounced';

const STATUS_FILTERS: Array<TenantStatus | 'ALL'> = ['ALL', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'FAILED'];

export default function TenantsPage() {
  return (
    <React.Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <TenantsPageContent />
    </React.Suspense>
  );
}

function TenantsPageContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(searchParams.get('new') === '1');
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [statusFilter, setStatusFilter] = React.useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [pendingAction, setPendingAction] = React.useState<{ tenant: Tenant; action: 'suspend' | 'reactivate' } | null>(null);

  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiFetch<Tenant[]>('/api/tenants'),
    refetchInterval: 5000, // provisioning is async — poll while any tenant is mid-flight
  });

  const filtered = React.useMemo(() => {
    let rows = tenants ?? [];
    if (statusFilter !== 'ALL') rows = rows.filter((t) => t.status === statusFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      rows = rows.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || t.primaryContactEmail.toLowerCase().includes(q));
    }
    return rows;
  }, [tenants, statusFilter, debouncedSearch]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [debouncedSearch, statusFilter]);

  const setStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'suspend' | 'reactivate' }) => apiFetch(`/api/tenants/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_data, variables) => {
      toast.success(variables.action === 'suspend' ? 'Tenant suspended' : 'Tenant reactivated');
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setPendingAction(null);
    },
    onError: (err) => toast.error('Could not update tenant', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const columns = React.useMemo<ColumnDef<Tenant>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => (
          <Link href={`/tenants/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'slug',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Slug" />,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.slug}</span>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => <TenantStatusBadge status={row.original.status} />,
      },
      { accessorKey: 'primaryContactEmail', header: ({ column }) => <DataTableColumnHeader column={column} label="Primary contact" /> },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        cell: ({ row }) => <span className="text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const tenant = row.original;
          if (tenant.status !== 'ACTIVE' && tenant.status !== 'SUSPENDED') return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Tenant actions" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {tenant.status === 'ACTIVE' ? (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setPendingAction({ tenant, action: 'suspend' })}>
                    Suspend
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setPendingAction({ tenant, action: 'reactivate' })}>Reactivate</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Tenants"
        description="Every customer organization on the TopiaDesk platform."
        actions={<CreateTenantDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input placeholder="Search tenants…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as (typeof STATUS_FILTERS)[number])}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(t) => t.id}
        isLoading={isLoading}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={<p className="text-muted-foreground">No tenants match your filters.</p>}
      />

      <ConfirmDialog
        open={!!pendingAction}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={pendingAction?.action === 'suspend' ? `Suspend ${pendingAction.tenant.name}?` : `Reactivate ${pendingAction?.tenant.name}?`}
        description={
          pendingAction?.action === 'suspend'
            ? 'Every user in this organization will immediately lose access, including admins. Reactivating restores access right away.'
            : undefined
        }
        confirmLabel={pendingAction?.action === 'suspend' ? 'Suspend' : 'Reactivate'}
        destructive={pendingAction?.action === 'suspend'}
        isPending={setStatus.isPending}
        onConfirm={() => pendingAction && setStatus.mutate({ id: pendingAction.tenant.id, action: pendingAction.action })}
      />
    </div>
  );
}

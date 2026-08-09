'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Badge, Button, DataTable, DataTableColumnHeader, Input, type ColumnDef, type PaginationState, toast } from '@topiadesk/ui';
import { apiFetch, ApiError } from '../_lib/api';
import type { PlatformAdmin } from '../_lib/types';
import { CreateAdminDialog } from './_create-admin-dialog';
import { PageHeader } from '../_components/page-header';
import { useDebounced } from '@/lib/use-debounced';

export default function PlatformAdminsPage() {
  return (
    <React.Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <PlatformAdminsPageContent />
    </React.Suspense>
  );
}

function PlatformAdminsPageContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = React.useState(searchParams.get('new') === '1');
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const { data: admins, isLoading } = useQuery({
    queryKey: ['platform-admins'],
    queryFn: () => apiFetch<PlatformAdmin[]>('/api/admins'),
  });

  const filtered = React.useMemo(() => {
    if (!debouncedSearch) return admins ?? [];
    const q = debouncedSearch.toLowerCase();
    return (admins ?? []).filter((a) => a.fullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [admins, debouncedSearch]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [debouncedSearch]);

  const deactivate = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admins/${id}/deactivate`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Platform admin deactivated');
      queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
    },
    onError: (err) => toast.error('Could not deactivate', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admins/${id}/reactivate`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Platform admin reactivated');
      queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
    },
    onError: (err) => toast.error('Could not reactivate', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const columns = React.useMemo<ColumnDef<PlatformAdmin>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span>,
      },
      { accessorKey: 'email', header: ({ column }) => <DataTableColumnHeader column={column} label="Email" /> },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => <Badge variant={row.original.status === 'ACTIVE' ? 'success' : 'secondary'}>{row.original.status}</Badge>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        cell: ({ row }) => <span className="text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const admin = row.original;
          return admin.status === 'ACTIVE' ? (
            <Button variant="ghost" size="sm" onClick={() => deactivate.mutate(admin.id)} disabled={deactivate.isPending}>
              Deactivate
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => reactivate.mutate(admin.id)} disabled={reactivate.isPending}>
              Reactivate
            </Button>
          );
        },
      },
    ],
    [deactivate, reactivate],
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Platform Admins"
        description="Operator accounts with access to this Global Admin console."
        actions={<CreateAdminDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
      />

      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input placeholder="Search admins…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(a) => a.id}
        isLoading={isLoading}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={<p className="text-muted-foreground">No platform admins match your search.</p>}
      />
    </div>
  );
}

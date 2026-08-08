'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Badge, Button, type ColumnDef, DataTable, DataTableColumnHeader, type RowSelectionState, selectionColumn, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { AdminBulkActionToolbar } from '../_components/admin-bulk-action-toolbar';
import { apiFetch } from '../_lib/api';
import { useRoles } from '../_lib/queries';
import { canWriteAdmin } from '../_lib/permissions';
import type { IpWhitelistEntryDto } from '../_lib/types';
import { IpWhitelistFormDialog } from './ip-whitelist-form-dialog';

export default function IpWhitelistPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const entriesQuery = useQuery({
    queryKey: ['admin', 'ip-whitelist'],
    queryFn: () => apiFetch<IpWhitelistEntryDto[]>('/api/admin/ip-whitelist'),
  });
  const rolesQuery = useRoles();
  const roleNameById = useMemo(() => new Map((rolesQuery.data ?? []).map((r) => [r.id, r.name])), [rolesQuery.data]);

  const [formTarget, setFormTarget] = useState<'create' | IpWhitelistEntryDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IpWhitelistEntryDto | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/ip-whitelist/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Entry deleted');
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'ip-whitelist'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete entry'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => apiFetch<void>(`/api/admin/ip-whitelist/${id}`, { method: 'DELETE' }))),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} entr${ids.length === 1 ? 'y' : 'ies'} deleted`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'ip-whitelist'] });
      setRowSelection({});
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete entries'),
  });

  const bulkToggleActiveMutation = useMutation({
    mutationFn: ({ ids, isActive }: { ids: string[]; isActive: boolean }) =>
      Promise.all(ids.map((id) => apiFetch<IpWhitelistEntryDto>(`/api/admin/ip-whitelist/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }))),
    onSuccess: (_data, { ids }) => {
      toast.success(`${ids.length} entr${ids.length === 1 ? 'y' : 'ies'} updated`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'ip-whitelist'] });
      setRowSelection({});
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update entries'),
  });
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const columns = useMemo<ColumnDef<IpWhitelistEntryDto>[]>(() => {
    const cols: ColumnDef<IpWhitelistEntryDto>[] = [
      selectionColumn<IpWhitelistEntryDto>(),
      {
        accessorKey: 'cidrRange',
        header: ({ column }) => <DataTableColumnHeader column={column} label="CIDR range" />,
        cell: ({ row }) => <span className="font-mono text-sm text-foreground">{row.original.cidrRange}</span>,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.description ?? '—'}</span>,
      },
      {
        id: 'appliesTo',
        header: 'Applies to',
        accessorFn: (e) => (e.appliesToRoleId ? (roleNameById.get(e.appliesToRoleId) ?? '—') : 'All roles'),
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Active" />,
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
    ];
    if (canWrite) {
      cols.push({
        id: 'actions',
        header: 'Actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.cidrRange}`} onClick={() => setFormTarget(row.original)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${row.original.cidrRange}`}
              onClick={() => setPendingDelete(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      });
    }
    return cols;
  }, [canWrite, roleNameById]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="IP Whitelist"
        description="CIDR ranges admin CRUD manages here. Enforcement is a separate app-layer middleware gated by the IP_WHITELIST_ENFORCED flag — not yet wired in, so entries here are recorded but not yet actively blocking traffic."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setFormTarget('create')}>
              <Plus className="h-4 w-4" /> New entry
            </Button>
          ) : undefined
        }
      />

      {canWrite ? (
        <AdminBulkActionToolbar
          selectedCount={selectedIds.length}
          onClearSelection={() => setRowSelection({})}
          actions={[
            {
              label: 'Activate',
              icon: Power,
              isPending: bulkToggleActiveMutation.isPending,
              onClick: () => bulkToggleActiveMutation.mutate({ ids: selectedIds, isActive: true }),
            },
            {
              label: 'Deactivate',
              icon: Power,
              isPending: bulkToggleActiveMutation.isPending,
              onClick: () => bulkToggleActiveMutation.mutate({ ids: selectedIds, isActive: false }),
            },
            {
              label: 'Delete',
              icon: Trash2,
              destructive: true,
              isPending: bulkDeleteMutation.isPending,
              confirmTitle: `Delete ${selectedIds.length} entr${selectedIds.length === 1 ? 'y' : 'ies'}?`,
              confirmDescription: 'These ranges will no longer be recorded as whitelisted.',
              onClick: () => bulkDeleteMutation.mutate(selectedIds),
            },
          ]}
        />
      ) : null}

      {!entriesQuery.isLoading && !entriesQuery.isError && (entriesQuery.data ?? []).length === 0 ? (
        <EmptyState title="No whitelist entries yet" />
      ) : (
        <DataTable<IpWhitelistEntryDto, unknown>
          columns={columns}
          data={entriesQuery.data ?? []}
          getRowId={(e) => e.id}
          isLoading={entriesQuery.isLoading}
          isError={entriesQuery.isError}
          errorState={<ErrorState error={entriesQuery.error} />}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={(entriesQuery.data ?? []).length}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      {formTarget ? (
        <IpWhitelistFormDialog target={formTarget} open={!!formTarget} onOpenChange={(open) => !open && setFormTarget(null)} />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open={!!pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete "${pendingDelete.cidrRange}"?`}
          description="This range will no longer be recorded as whitelisted."
          confirmLabel="Delete"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        />
      ) : null}
    </div>
  );
}

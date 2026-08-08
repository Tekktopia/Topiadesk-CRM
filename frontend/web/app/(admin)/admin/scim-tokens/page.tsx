'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, ShieldOff } from 'lucide-react';
import { Badge, Button, type ColumnDef, DataTable, DataTableColumnHeader, type RowSelectionState, selectionColumn, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { AdminBulkActionToolbar } from '../_components/admin-bulk-action-toolbar';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { ScimTokenDto } from '../_lib/types';
import { ScimTokenCreateDialog } from './scim-token-create-dialog';
import { ScimTokenEditDialog } from './scim-token-edit-dialog';

export default function ScimTokensPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ScimTokenDto | null>(null);
  const [revoking, setRevoking] = useState<ScimTokenDto | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const tokensQuery = useQuery({
    queryKey: ['admin', 'scim-tokens'],
    queryFn: () => apiFetch<ScimTokenDto[]>('/api/admin/scim-tokens'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiFetch<ScimTokenDto>(`/api/admin/scim-tokens/${id}/deactivate`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Token revoked');
      queryClient.invalidateQueries({ queryKey: ['admin', 'scim-tokens'] });
      setRevoking(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to revoke token'),
  });

  const bulkRevokeMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => apiFetch<ScimTokenDto>(`/api/admin/scim-tokens/${id}/deactivate`, { method: 'POST' }))),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} token${ids.length === 1 ? '' : 's'} revoked`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'scim-tokens'] });
      setRowSelection({});
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to revoke tokens'),
  });
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const tokens = tokensQuery.data ?? [];

  const columns = useMemo<ColumnDef<ScimTokenDto>[]>(() => {
    const cols: ColumnDef<ScimTokenDto>[] = [
      selectionColumn<ScimTokenDto>(),
      {
        accessorKey: 'description',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Label" />,
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.description}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{new Date(row.original.createdAt).toLocaleString()}</span>
        ),
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
      {
        accessorKey: 'lastUsedAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Last used" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.lastUsedAt ? new Date(row.original.lastUsedAt).toLocaleString() : 'Never'}
          </span>
        ),
        sortingFn: (a, b) =>
          new Date(a.original.lastUsedAt ?? 0).getTime() - new Date(b.original.lastUsedAt ?? 0).getTime(),
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'secondary'}>{row.original.isActive ? 'Active' : 'Revoked'}</Badge>
        ),
      },
    ];
    if (canWrite) {
      cols.push({
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.description}`} onClick={() => setEditing(row.original)}>
              <Pencil className="h-4 w-4" />
            </Button>
            {row.original.isActive ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setRevoking(row.original)}
              >
                Revoke
              </Button>
            ) : null}
          </div>
        ),
      });
    }
    return cols;
  }, [canWrite]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SCIM Tokens"
        description="Bearer tokens for identity provider provisioning connectors (Okta, Azure AD, ...) against /scim/v2/*. Each raw token is shown once, at creation."
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> Create token
            </Button>
          ) : null
        }
      />

      {canWrite ? (
        <AdminBulkActionToolbar
          selectedCount={selectedIds.length}
          onClearSelection={() => setRowSelection({})}
          actions={[
            {
              label: 'Revoke',
              icon: ShieldOff,
              destructive: true,
              isPending: bulkRevokeMutation.isPending,
              confirmTitle: `Revoke ${selectedIds.length} token${selectedIds.length === 1 ? '' : 's'}?`,
              confirmDescription: 'Any provisioning connector using these tokens will immediately lose access. This can’t be undone.',
              onClick: () => bulkRevokeMutation.mutate(selectedIds),
            },
          ]}
        />
      ) : null}

      {!tokensQuery.isLoading && !tokensQuery.isError && tokens.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-8 w-8" aria-hidden />}
          title="No SCIM tokens yet"
          description="Create one to let an identity provider provision users via SCIM."
        />
      ) : (
        <DataTable<ScimTokenDto, unknown>
          columns={columns}
          data={tokens}
          getRowId={(t) => t.id}
          isLoading={tokensQuery.isLoading}
          isError={tokensQuery.isError}
          errorState={<ErrorState error={tokensQuery.error} />}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={tokens.length}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      <ScimTokenCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      {editing ? <ScimTokenEditDialog target={editing} open={!!editing} onOpenChange={(open) => !open && setEditing(null)} /> : null}

      {revoking ? (
        <ConfirmDialog
          open={!!revoking}
          onOpenChange={(open) => !open && setRevoking(null)}
          title={`Revoke "${revoking.description}"?`}
          description="Any provisioning connector using this token will immediately lose access. This can't be undone — create a new token if the connector still needs one."
          confirmLabel="Revoke"
          destructive
          isPending={revokeMutation.isPending}
          onConfirm={() => revokeMutation.mutate(revoking.id)}
        />
      ) : null}
    </div>
  );
}

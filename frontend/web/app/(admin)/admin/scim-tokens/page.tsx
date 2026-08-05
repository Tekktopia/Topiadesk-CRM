'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus } from 'lucide-react';
import { Badge, Button, type ColumnDef, DataTable, DataTableColumnHeader, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { ScimTokenDto } from '../_lib/types';
import { ScimTokenCreateDialog } from './scim-token-create-dialog';

export default function ScimTokensPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<ScimTokenDto | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

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

  const tokens = tokensQuery.data ?? [];

  const columns = useMemo<ColumnDef<ScimTokenDto>[]>(() => {
    const cols: ColumnDef<ScimTokenDto>[] = [
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
        cell: ({ row }) =>
          row.original.isActive ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setRevoking(row.original)}
            >
              Revoke
            </Button>
          ) : null,
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
        />
      )}

      <ScimTokenCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

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

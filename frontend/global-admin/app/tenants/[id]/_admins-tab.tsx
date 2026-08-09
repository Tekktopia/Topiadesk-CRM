'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, DataTable, DataTableColumnHeader, type ColumnDef, toast } from '@topiadesk/ui';
import { apiFetch, ApiError } from '../../_lib/api';
import type { TenantUser } from '../../_lib/types';
import { CreateTenantAdminDialog } from './_create-tenant-admin-dialog';
import { ResetPasswordDialog } from './_reset-password-dialog';
import { ResetPasswordInputDialog } from './_reset-password-input-dialog';

export function AdminsTab({ tenantId, tenantUrl }: { tenantId: string; tenantUrl: string | null }) {
  const queryClient = useQueryClient();
  const [resetTarget, setResetTarget] = React.useState<TenantUser | null>(null);
  const [resetInputOpen, setResetInputOpen] = React.useState(false);
  const [temporaryPassword, setTemporaryPassword] = React.useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => apiFetch<TenantUser[]>(`/api/tenants/${tenantId}/users`),
  });

  const resetPassword = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password?: string }) =>
      apiFetch<{ temporaryPassword: string }>(`/api/tenants/${tenantId}/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    onSuccess: (res) => {
      setResetInputOpen(false);
      setTemporaryPassword(res.temporaryPassword);
    },
    onError: (err) => toast.error('Could not reset password', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const deactivate = useMutation({
    mutationFn: (userId: string) => apiFetch(`/api/tenants/${tenantId}/users/${userId}/deactivate`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('User deactivated');
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenant-admin-summary'] });
    },
    onError: (err) => toast.error('Could not deactivate', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const reactivate = useMutation({
    mutationFn: (userId: string) => apiFetch(`/api/tenants/${tenantId}/users/${userId}/reactivate`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('User reactivated');
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenant-admin-summary'] });
    },
    onError: (err) => toast.error('Could not reactivate', { description: err instanceof ApiError ? err.message : undefined }),
  });

  const columns = React.useMemo<ColumnDef<TenantUser>[]>(
    () => [
      { accessorKey: 'fullName', header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />, cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span> },
      { accessorKey: 'email', header: ({ column }) => <DataTableColumnHeader column={column} label="Email" /> },
      {
        accessorKey: 'roles',
        header: 'Roles',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} variant="outline" className="text-[10px]">
                {r}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => <Badge variant={row.original.status === 'ACTIVE' ? 'success' : 'secondary'}>{row.original.status}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setResetTarget(user);
                  setResetInputOpen(true);
                }}
              >
                Reset password
              </Button>
              {user.status === 'ACTIVE' ? (
                <Button variant="ghost" size="sm" onClick={() => deactivate.mutate(user.id)} disabled={deactivate.isPending}>
                  Deactivate
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => reactivate.mutate(user.id)} disabled={reactivate.isPending}>
                  Reactivate
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [deactivate, reactivate],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <CreateTenantAdminDialog tenantId={tenantId} tenantUrl={tenantUrl} />
      </div>
      <DataTable columns={columns} data={users ?? []} getRowId={(u) => u.id} isLoading={isLoading} emptyState={<p className="text-muted-foreground">No users yet.</p>} />
      <ResetPasswordInputDialog
        open={resetInputOpen}
        onOpenChange={(open) => {
          setResetInputOpen(open);
          if (!open) setResetTarget(null);
        }}
        userName={resetTarget?.fullName ?? ''}
        isPending={resetPassword.isPending}
        onSubmit={(password) => {
          if (!resetTarget) return;
          resetPassword.mutate({ userId: resetTarget.id, password });
        }}
      />
      <ResetPasswordDialog
        open={resetTarget !== null && temporaryPassword !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setTemporaryPassword(null);
          }
        }}
        userName={resetTarget?.fullName ?? ''}
        temporaryPassword={temporaryPassword}
      />
    </div>
  );
}

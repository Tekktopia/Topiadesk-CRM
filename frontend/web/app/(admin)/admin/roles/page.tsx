'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { useRoles } from '../_lib/queries';
import { canWriteAdmin } from '../_lib/permissions';
import { grantSentence, resourceLabel, scopeLabel } from '../_lib/rbac-labels';
import type { PermissionSummaryDto, RoleDto } from '../_lib/types';
import { RoleFormDialog } from './role-form-dialog';
import { GrantPermissionDialog } from './grant-permission-dialog';

export default function RolesPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const rolesQuery = useRoles();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleFormMode, setRoleFormMode] = useState<'create' | 'edit' | null>(null);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [pendingDeleteRole, setPendingDeleteRole] = useState<RoleDto | null>(null);
  const [pendingRevokeGrant, setPendingRevokeGrant] = useState<PermissionSummaryDto | null>(null);
  const [grantsPagination, setGrantsPagination] = useState({ pageIndex: 0, pageSize: 10 });

  useEffect(() => {
    const first = rolesQuery.data?.[0];
    if (!selectedRoleId && first) {
      setSelectedRoleId(first.id);
    }
  }, [rolesQuery.data, selectedRoleId]);

  const selectedRole = useMemo(
    () => rolesQuery.data?.find((r) => r.id === selectedRoleId) ?? null,
    [rolesQuery.data, selectedRoleId],
  );

  // Default view groups grants by resource (alphabetical) same as before —
  // DataTable's column sort then layers asc/desc toggling for
  // resource/action/scope on top of this baseline order.
  const grantRows = useMemo(() => {
    if (!selectedRole) return [];
    return [...selectedRole.permissions].sort((a, b) => a.resource.localeCompare(b.resource));
  }, [selectedRole]);

  useEffect(() => {
    setGrantsPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [selectedRoleId]);

  const grantColumns = useMemo<ColumnDef<PermissionSummaryDto>[]>(() => {
    const cols: ColumnDef<PermissionSummaryDto>[] = [
      {
        accessorKey: 'resource',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Resource" />,
        cell: ({ row }) => <span className="font-medium text-foreground">{resourceLabel(row.original.resource)}</span>,
      },
      {
        accessorKey: 'action',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Action" />,
        cell: ({ row }) => <Badge variant={row.original.action === 'write' ? 'default' : 'secondary'}>{row.original.action}</Badge>,
      },
      {
        accessorKey: 'scope',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Scope" />,
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline">{row.original.scope}</Badge>
            </TooltipTrigger>
            <TooltipContent>{scopeLabel(row.original.scope)}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: 'meaning',
        header: 'What this means',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {grantSentence(row.original.resource, row.original.action, row.original.scope)}
          </span>
        ),
      },
    ];
    if (canWrite) {
      cols.push({
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Revoke ${row.original.resource} ${row.original.action} ${row.original.scope}`}
            onClick={() => setPendingRevokeGrant(row.original)}
          >
            <X className="h-4 w-4" />
          </Button>
        ),
      });
    }
    return cols;
  }, [canWrite]);

  function invalidateRoles() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
  }

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) => apiFetch<void>(`/api/admin/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Role deleted');
      setPendingDeleteRole(null);
      setSelectedRoleId(null);
      invalidateRoles();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete role'),
  });

  const revokeGrantMutation = useMutation({
    mutationFn: (permissionId: string) =>
      apiFetch<RoleDto>(`/api/admin/roles/${selectedRoleId}/permissions/${permissionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Grant revoked');
      setPendingRevokeGrant(null);
      invalidateRoles();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to revoke grant'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="Every grant here is a resource/action/scope triple — exactly what a role can do, and to whose records. Changes are recorded as PERMISSION_CHANGE audit events."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setRoleFormMode('create')}>
              <Plus className="h-4 w-4" /> New role
            </Button>
          ) : undefined
        }
      />

      {rolesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : rolesQuery.isError ? (
        <ErrorState error={rolesQuery.error} />
      ) : (rolesQuery.data ?? []).length === 0 ? (
        <EmptyState title="No roles defined" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardContent className="space-y-1 p-2">
              {rolesQuery.data?.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    role.id === selectedRoleId ? 'bg-secondary text-secondary-foreground' : 'hover:bg-secondary/50'
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2 font-medium text-foreground">
                    {role.name}
                    {role.isSystemRole ? (
                      <Badge variant="outline" className="text-[10px]">
                        System
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{role.permissions.length} grants</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedRole ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {selectedRole.name}
                    {selectedRole.isSystemRole ? <Badge variant="outline">System role</Badge> : null}
                  </CardTitle>
                  <CardDescription>{selectedRole.description ?? 'No description'}</CardDescription>
                </div>
                {canWrite ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRoleFormMode('edit')}>
                      Edit
                    </Button>
                    {!selectedRole.isSystemRole ? (
                      <Button size="sm" variant="outline" onClick={() => setPendingDeleteRole(selectedRole)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {canWrite ? (
                  <Button size="sm" variant="outline" onClick={() => setShowGrantDialog(true)}>
                    <Plus className="h-4 w-4" /> Add grant
                  </Button>
                ) : null}

                {grantRows.length === 0 ? (
                  <EmptyState title="No permission grants" description="This role currently cannot access any resource." />
                ) : (
                  <DataTable<PermissionSummaryDto, unknown>
                    columns={grantColumns}
                    data={grantRows}
                    getRowId={(g) => g.id}
                    pagination={grantsPagination}
                    onPaginationChange={setGrantsPagination}
                    totalRowCount={grantRows.length}
                  />
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {roleFormMode ? (
        <RoleFormDialog
          mode={roleFormMode}
          role={roleFormMode === 'edit' ? selectedRole : null}
          open={!!roleFormMode}
          onOpenChange={(open) => !open && setRoleFormMode(null)}
          onCreated={(id) => setSelectedRoleId(id)}
        />
      ) : null}

      {showGrantDialog && selectedRole ? (
        <GrantPermissionDialog
          role={selectedRole}
          open={showGrantDialog}
          onOpenChange={setShowGrantDialog}
        />
      ) : null}

      {pendingDeleteRole ? (
        <ConfirmDialog
          open={!!pendingDeleteRole}
          onOpenChange={(open) => !open && setPendingDeleteRole(null)}
          title={`Delete role "${pendingDeleteRole.name}"?`}
          description="Any users currently assigned this role will lose the access it grants. This cannot be undone."
          confirmLabel="Delete"
          destructive
          isPending={deleteRoleMutation.isPending}
          onConfirm={() => deleteRoleMutation.mutate(pendingDeleteRole.id)}
        />
      ) : null}

      {pendingRevokeGrant ? (
        <ConfirmDialog
          open={!!pendingRevokeGrant}
          onOpenChange={(open) => !open && setPendingRevokeGrant(null)}
          title="Revoke this permission grant?"
          description={`"${selectedRole?.name}" will immediately lose: ${grantSentence(pendingRevokeGrant.resource, pendingRevokeGrant.action, pendingRevokeGrant.scope)}.`}
          confirmLabel="Revoke"
          destructive
          isPending={revokeGrantMutation.isPending}
          onConfirm={() => revokeGrantMutation.mutate(pendingRevokeGrant.id)}
        />
      ) : null}
    </div>
  );
}

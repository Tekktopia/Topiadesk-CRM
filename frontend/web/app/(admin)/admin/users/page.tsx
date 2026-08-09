'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, MoreHorizontal, Plus, Search, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  selectionColumn,
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { AdminBulkActionToolbar } from '../_components/admin-bulk-action-toolbar';
import { UserStatusBadge } from '../_components/status-badge';
import { apiFetch } from '../_lib/api';
import { useBranches, useDepartments } from '../_lib/queries';
import { canWriteAdmin } from '../_lib/permissions';
import type { UserDto } from '../_lib/types';
import { UserEditDialog } from './user-edit-dialog';
import { BulkInviteDialog } from './bulk-invite-dialog';
import { CreateUserDialog } from './create-user-dialog';

const STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function UsersPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ user: UserDto; action: 'deactivate' | 'reactivate' } | null>(
    null,
  );
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const departmentsQuery = useDepartments();
  const branchesQuery = useBranches();
  const departmentById = useMemo(
    () => new Map((departmentsQuery.data ?? []).map((d) => [d.id, d.name])),
    [departmentsQuery.data],
  );
  const branchById = useMemo(() => new Map((branchesQuery.data ?? []).map((b) => [b.id, b.name])), [branchesQuery.data]);

  const qs = useMemo(() => {
    const params = new URLSearchParams({ take: '100' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (departmentFilter !== 'ALL') params.set('departmentId', departmentFilter);
    return params.toString();
  }, [debouncedSearch, statusFilter, departmentFilter]);

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', qs],
    queryFn: () => apiFetch<UserDto[]>(`/api/admin/users?${qs}`),
  });

  // A search/filter edit can shrink the result set below the current page —
  // drop back to page 1 whenever the query itself changes.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [qs]);

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'deactivate' | 'reactivate' }) =>
      apiFetch<UserDto>(`/api/admin/users/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_data, variables) => {
      toast.success(variables.action === 'deactivate' ? 'User deactivated' : 'User reactivated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setPendingStatusChange(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update user status');
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'deactivate' | 'reactivate' }) =>
      Promise.all(ids.map((id) => apiFetch<UserDto>(`/api/admin/users/${id}/${action}`, { method: 'POST' }))),
    onSuccess: (_data, { ids, action }) => {
      toast.success(`${ids.length} user${ids.length === 1 ? '' : 's'} ${action === 'deactivate' ? 'deactivated' : 'reactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setRowSelection({});
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update users'),
  });
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const columns = useMemo<ColumnDef<UserDto>[]>(() => {
    const cols: ColumnDef<UserDto>[] = [
      selectionColumn<UserDto>(),
      {
        accessorKey: 'fullName',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.fullName}</span>,
      },
      {
        accessorKey: 'email',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Email" />,
        meta: { label: 'Email' },
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.email}</span>,
      },
      {
        id: 'department',
        header: 'Department',
        meta: { label: 'Department' },
        accessorFn: (u) => (u.departmentId ? (departmentById.get(u.departmentId) ?? '—') : '—'),
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'branch',
        header: 'Branch',
        meta: { label: 'Branch' },
        accessorFn: (u) => (u.branchId ? (branchById.get(u.branchId) ?? '—') : '—'),
        cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'roles',
        header: 'Roles',
        meta: { label: 'Roles' },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.length === 0 ? (
              <span className="text-xs text-muted-foreground">No roles</span>
            ) : (
              row.original.roles.map((r) => (
                <Badge key={r.id} variant="outline">
                  {r.name}
                </Badge>
              ))
            )}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        enableSorting: false,
        cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        meta: { label: 'Created' },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>
        ),
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
    ];
    if (canWrite) {
      cols.push({
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${row.original.fullName}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditingUserId(row.original.id)}>Edit &amp; manage roles</DropdownMenuItem>
                {row.original.status === 'DEACTIVATED' ? (
                  <DropdownMenuItem onSelect={() => setPendingStatusChange({ user: row.original, action: 'reactivate' })}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Reactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setPendingStatusChange({ user: row.original, action: 'deactivate' })}
                  >
                    <Ban className="h-4 w-4" aria-hidden /> Deactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      });
    }
    return cols;
  }, [canWrite, departmentById, branchById]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Directory of every synced identity, their org placement, and role assignments."
        actions={
          canWrite ? (
            <>
              <Button variant="outline" onClick={() => setBulkInviteOpen(true)}>
                <Upload className="mr-2 h-4 w-4" aria-hidden />
                Bulk invite
              </Button>
              <Button onClick={() => setCreateUserOpen(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                New user
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All departments</SelectItem>
            {(departmentsQuery.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canWrite ? (
        <AdminBulkActionToolbar
          selectedCount={selectedIds.length}
          onClearSelection={() => setRowSelection({})}
          actions={[
            {
              label: 'Deactivate',
              icon: Ban,
              isPending: bulkStatusMutation.isPending,
              confirmTitle: `Deactivate ${selectedIds.length} user${selectedIds.length === 1 ? '' : 's'}?`,
              confirmDescription: 'They will immediately lose the ability to sign in. Their records and role assignments are kept and this can be reversed.',
              onClick: () => bulkStatusMutation.mutate({ ids: selectedIds, action: 'deactivate' }),
            },
            {
              label: 'Reactivate',
              icon: CheckCircle2,
              isPending: bulkStatusMutation.isPending,
              onClick: () => bulkStatusMutation.mutate({ ids: selectedIds, action: 'reactivate' }),
            },
          ]}
        />
      ) : null}

      {!usersQuery.isLoading && !usersQuery.isError && (usersQuery.data ?? []).length === 0 ? (
        <EmptyState title="No users match these filters" description="Try clearing the search or filters above." />
      ) : (
        <DataTable<UserDto, unknown>
          columns={columns}
          data={usersQuery.data ?? []}
          getRowId={(u) => u.id}
          isLoading={usersQuery.isLoading}
          isError={usersQuery.isError}
          errorState={<ErrorState error={usersQuery.error} />}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={(usersQuery.data ?? []).length}
          onRowClick={canWrite ? (u) => setEditingUserId(u.id) : undefined}
          enableColumnVisibility
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      {editingUserId ? (
        <UserEditDialog
          userId={editingUserId}
          canWrite={canWrite}
          open={!!editingUserId}
          onOpenChange={(open) => !open && setEditingUserId(null)}
        />
      ) : null}

      <BulkInviteDialog open={bulkInviteOpen} onOpenChange={setBulkInviteOpen} />

      <CreateUserDialog open={createUserOpen} onOpenChange={setCreateUserOpen} />

      {pendingStatusChange ? (
        <ConfirmDialog
          open={!!pendingStatusChange}
          onOpenChange={(open) => !open && setPendingStatusChange(null)}
          title={pendingStatusChange.action === 'deactivate' ? `Deactivate ${pendingStatusChange.user.fullName}?` : `Reactivate ${pendingStatusChange.user.fullName}?`}
          description={
            pendingStatusChange.action === 'deactivate'
              ? 'They will immediately lose the ability to sign in. Their records and role assignments are kept and this can be reversed.'
              : 'They will regain the ability to sign in with their existing role assignments.'
          }
          confirmLabel={pendingStatusChange.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
          destructive={pendingStatusChange.action === 'deactivate'}
          isPending={statusMutation.isPending}
          onConfirm={() =>
            pendingStatusChange &&
            statusMutation.mutate({ id: pendingStatusChange.user.id, action: pendingStatusChange.action })
          }
        />
      ) : null}
    </div>
  );
}

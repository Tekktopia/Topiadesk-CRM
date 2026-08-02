'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, MoreHorizontal, Search } from 'lucide-react';
import {
  Badge,
  Button,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { UserStatusBadge } from '../_components/status-badge';
import { apiFetch } from '../_lib/api';
import { useBranches, useDepartments } from '../_lib/queries';
import { canWriteAdmin } from '../_lib/permissions';
import type { UserDto } from '../_lib/types';
import { UserEditDialog } from './user-edit-dialog';

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
  const [pendingStatusChange, setPendingStatusChange] = useState<{ user: UserDto; action: 'deactivate' | 'reactivate' } | null>(
    null,
  );

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Directory of every synced identity, their org placement, and role assignments."
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

      {usersQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : usersQuery.isError ? (
        <ErrorState error={usersQuery.error} />
      ) : (usersQuery.data ?? []).length === 0 ? (
        <EmptyState title="No users match these filters" description="Try clearing the search or filters above." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                {canWrite ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersQuery.data ?? []).map((u) => (
                <TableRow key={u.id} className="cursor-pointer" onClick={() => canWrite && setEditingUserId(u.id)}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{u.fullName}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.departmentId ? (departmentById.get(u.departmentId) ?? '—') : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.branchId ? (branchById.get(u.branchId) ?? '—') : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No roles</span>
                      ) : (
                        u.roles.map((r) => (
                          <Badge key={r.id} variant="outline">
                            {r.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge status={u.status} />
                  </TableCell>
                  {canWrite ? (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${u.fullName}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditingUserId(u.id)}>Edit &amp; manage roles</DropdownMenuItem>
                          {u.status === 'DEACTIVATED' ? (
                            <DropdownMenuItem onSelect={() => setPendingStatusChange({ user: u, action: 'reactivate' })}>
                              <CheckCircle2 className="h-4 w-4" aria-hidden /> Reactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setPendingStatusChange({ user: u, action: 'deactivate' })}
                            >
                              <Ban className="h-4 w-4" aria-hidden /> Deactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editingUserId ? (
        <UserEditDialog
          userId={editingUserId}
          canWrite={canWrite}
          open={!!editingUserId}
          onOpenChange={(open) => !open && setEditingUserId(null)}
        />
      ) : null}

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

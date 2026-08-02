'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  toast,
} from '@topiadesk/ui';
import { UserStatusBadge } from '../_components/status-badge';
import { apiFetch } from '../_lib/api';
import { useBranches, useDepartments, useRoles } from '../_lib/queries';
import type { UpdateUserBody, UserDto } from '../_lib/types';

const UNASSIGNED = '__unassigned__';

export function UserEditDialog({
  userId,
  open,
  onOpenChange,
  canWrite,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const userQuery = useQuery({
    queryKey: ['admin', 'users', 'detail', userId],
    queryFn: () => apiFetch<UserDto>(`/api/admin/users/${userId}`),
    enabled: open,
  });
  const departmentsQuery = useDepartments();
  const branchesQuery = useBranches();
  const rolesQuery = useRoles();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState<string>(UNASSIGNED);
  const [branchId, setBranchId] = useState<string>(UNASSIGNED);
  const [roleToAdd, setRoleToAdd] = useState<string>('');

  useEffect(() => {
    if (userQuery.data) {
      setFullName(userQuery.data.fullName);
      setPhone(userQuery.data.phone ?? '');
      setDepartmentId(userQuery.data.departmentId ?? UNASSIGNED);
      setBranchId(userQuery.data.branchId ?? UNASSIGNED);
    }
  }, [userQuery.data]);

  function invalidateUser() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  }

  const updateMutation = useMutation({
    mutationFn: (body: UpdateUserBody) => apiFetch<UserDto>(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('User updated');
      invalidateUser();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update user'),
  });

  const assignRoleMutation = useMutation({
    mutationFn: (roleId: string) =>
      apiFetch<UserDto>(`/api/admin/users/${userId}/roles`, { method: 'POST', body: JSON.stringify({ roleId }) }),
    onSuccess: () => {
      toast.success('Role assigned');
      setRoleToAdd('');
      invalidateUser();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to assign role'),
  });

  const revokeRoleMutation = useMutation({
    mutationFn: (roleId: string) => apiFetch<UserDto>(`/api/admin/users/${userId}/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Role revoked');
      invalidateUser();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to revoke role'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userQuery.data) return;
    const body: UpdateUserBody = {};
    if (fullName !== userQuery.data.fullName) body.fullName = fullName;
    const phoneOrUndefined = phone || undefined;
    if (phoneOrUndefined !== (userQuery.data.phone ?? undefined)) body.phone = phoneOrUndefined;
    const newDepartmentId = departmentId === UNASSIGNED ? null : departmentId;
    if (newDepartmentId !== userQuery.data.departmentId) body.departmentId = newDepartmentId;
    const newBranchId = branchId === UNASSIGNED ? null : branchId;
    if (newBranchId !== userQuery.data.branchId) body.branchId = newBranchId;
    if (Object.keys(body).length === 0) {
      toast.info('Nothing changed');
      return;
    }
    updateMutation.mutate(body);
  }

  const assignedRoleIds = new Set((userQuery.data?.roles ?? []).map((r) => r.id));
  const availableRoles = (rolesQuery.data ?? []).filter((r) => !assignedRoleIds.has(r.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {userQuery.data?.fullName ?? 'User'}
            {userQuery.data ? <UserStatusBadge status={userQuery.data.status} /> : null}
          </DialogTitle>
          <DialogDescription>{userQuery.data?.email}</DialogDescription>
        </DialogHeader>

        {userQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : userQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load this user.</p>
        ) : (
          <div className="space-y-5">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!canWrite} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canWrite} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId} disabled={!canWrite}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {(departmentsQuery.data ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Branch</Label>
                  <Select value={branchId} onValueChange={setBranchId} disabled={!canWrite}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {(branchesQuery.data ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {canWrite ? (
                <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              ) : null}
            </form>

            <Separator />

            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-1.5">
                {(userQuery.data?.roles ?? []).length === 0 ? (
                  <span className="text-sm text-muted-foreground">No roles assigned.</span>
                ) : (
                  (userQuery.data?.roles ?? []).map((r) => (
                    <Badge key={r.id} variant="outline" className="gap-1 pr-1">
                      {r.name}
                      {canWrite ? (
                        <button
                          type="button"
                          aria-label={`Revoke ${r.name}`}
                          className="rounded-sm hover:bg-secondary"
                          onClick={() => revokeRoleMutation.mutate(r.id)}
                          disabled={revokeRoleMutation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </Badge>
                  ))
                )}
              </div>
              {canWrite ? (
                <div className="flex gap-2 pt-1">
                  <Select value={roleToAdd} onValueChange={setRoleToAdd}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Assign a role…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No more roles to assign</div>
                      ) : (
                        availableRoles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!roleToAdd || assignRoleMutation.isPending}
                    onClick={() => roleToAdd && assignRoleMutation.mutate(roleToAdd)}
                  >
                    Add
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

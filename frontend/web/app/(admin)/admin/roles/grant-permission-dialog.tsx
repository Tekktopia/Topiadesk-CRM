'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import { usePermissions } from '../_lib/queries';
import { grantSentence } from '../_lib/rbac-labels';
import type { RoleDto } from '../_lib/types';

export function GrantPermissionDialog({
  role,
  open,
  onOpenChange,
}: {
  role: RoleDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const permissionsQuery = usePermissions();
  const [permissionId, setPermissionId] = useState('');

  const grantedIds = useMemo(() => new Set(role.permissions.map((p) => p.id)), [role.permissions]);
  const available = useMemo(
    () => (permissionsQuery.data ?? []).filter((p) => !grantedIds.has(p.id)),
    [permissionsQuery.data, grantedIds],
  );

  const grantMutation = useMutation({
    mutationFn: () =>
      apiFetch<RoleDto>(`/api/admin/roles/${role.id}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ permissionId }),
      }),
    onSuccess: () => {
      toast.success('Grant added');
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      setPermissionId('');
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to add grant'),
  });

  const selected = available.find((p) => p.id === permissionId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a permission grant to {role.name}</DialogTitle>
          <DialogDescription>
            Grants are additive — this widens what {role.name} can do. The change is recorded as a PERMISSION_CHANGE
            audit event.
          </DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">This role already has every available grant.</p>
        ) : (
          <div className="space-y-3">
            <Select value={permissionId} onValueChange={setPermissionId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a grant…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.resource} · {p.action} · {p.scope}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? (
              <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                {grantSentence(selected.resource, selected.action, selected.scope)}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!permissionId || grantMutation.isPending} onClick={() => grantMutation.mutate()}>
            {grantMutation.isPending ? 'Adding…' : 'Add grant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

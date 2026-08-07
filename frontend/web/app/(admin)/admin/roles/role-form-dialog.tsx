'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { CreateRoleBody, RoleDto, UpdateRoleBody } from '../_lib/types';

export function RoleFormDialog({
  mode,
  role,
  open,
  onOpenChange,
  onCreated,
}: {
  mode: 'create' | 'edit';
  role: RoleDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requiredApprovalsToGrant, setRequiredApprovalsToGrant] = useState('1');

  useEffect(() => {
    if (mode === 'edit' && role) {
      setName(role.name);
      setDescription(role.description ?? '');
      setRequiredApprovalsToGrant(String(role.requiredApprovalsToGrant));
    } else if (mode === 'create') {
      setName('');
      setDescription('');
      setRequiredApprovalsToGrant('1');
    }
  }, [mode, role]);

  const createMutation = useMutation({
    mutationFn: (body: CreateRoleBody) => apiFetch<RoleDto>('/api/admin/roles', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (created) => {
      toast.success('Role created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      onCreated?.(created.id);
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create role'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateRoleBody) =>
      apiFetch<RoleDto>(`/api/admin/roles/${role?.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update role'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'create') {
      createMutation.mutate({ name, description: description || undefined });
    } else if (role) {
      const body: UpdateRoleBody = {};
      if (name !== role.name) body.name = name;
      if (description !== (role.description ?? '')) body.description = description;
      const parsedApprovals = Number.parseInt(requiredApprovalsToGrant, 10);
      if (!Number.isNaN(parsedApprovals) && parsedApprovals !== role.requiredApprovalsToGrant) {
        body.requiredApprovalsToGrant = parsedApprovals;
      }
      if (Object.keys(body).length === 0) {
        onOpenChange(false);
        return;
      }
      updateMutation.mutate(body);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const nameLocked = mode === 'edit' && !!role?.isSystemRole;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New role' : `Edit ${role?.name}`}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Custom roles start with no permission grants — add them from the role detail view.'
              : nameLocked
                ? 'System roles (ADMIN, MANAGER, ACCOUNT_HANDLER, COMPLIANCE_OFFICER) can’t be renamed — their names are referenced directly by RLS policies and the permission guard.'
                : 'Update this role’s name and description.'}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={nameLocked}
              required
              minLength={2}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-description">Description</Label>
            <Input
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>
          {mode === 'edit' ? (
            <div className="space-y-1.5">
              <Label htmlFor="role-approvals">Approvals required to grant this role</Label>
              <Input
                id="role-approvals"
                type="number"
                min={1}
                max={10}
                value={requiredApprovalsToGrant}
                onChange={(e) => setRequiredApprovalsToGrant(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                1 (default) grants immediately when assigned. A higher number requires that many distinct approvers before it takes effect.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? 'Saving…' : mode === 'create' ? 'Create role' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

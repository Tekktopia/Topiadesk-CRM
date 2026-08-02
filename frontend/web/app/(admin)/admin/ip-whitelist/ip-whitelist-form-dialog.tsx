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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import { useRoles } from '../_lib/queries';
import type { CreateIpWhitelistBody, IpWhitelistEntryDto, UpdateIpWhitelistBody } from '../_lib/types';

const ALL_ROLES = '__all__';

export function IpWhitelistFormDialog({
  target,
  open,
  onOpenChange,
}: {
  target: 'create' | IpWhitelistEntryDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const rolesQuery = useRoles();
  const isEdit = target !== 'create';

  const [cidrRange, setCidrRange] = useState('');
  const [description, setDescription] = useState('');
  const [appliesToRoleId, setAppliesToRoleId] = useState<string>(ALL_ROLES);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (isEdit) {
      setCidrRange(target.cidrRange);
      setDescription(target.description ?? '');
      setAppliesToRoleId(target.appliesToRoleId ?? ALL_ROLES);
      setIsActive(target.isActive);
    } else {
      setCidrRange('');
      setDescription('');
      setAppliesToRoleId(ALL_ROLES);
      setIsActive(true);
    }
  }, [target, isEdit]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'ip-whitelist'] });
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateIpWhitelistBody) =>
      apiFetch<IpWhitelistEntryDto>('/api/admin/ip-whitelist', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Entry created');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create entry'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateIpWhitelistBody) =>
      apiFetch<IpWhitelistEntryDto>(`/api/admin/ip-whitelist/${isEdit ? target.id : ''}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Entry updated');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update entry'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      cidrRange,
      description: description || undefined,
      appliesToRoleId: appliesToRoleId === ALL_ROLES ? null : appliesToRoleId,
      isActive,
    };
    if (isEdit) {
      updateMutation.mutate(body);
    } else {
      createMutation.mutate(body);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${target.cidrRange}` : 'New IP whitelist entry'}</DialogTitle>
          <DialogDescription>IPv4/IPv6 address or CIDR range, e.g. 10.0.0.0/24.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="cidr-range">CIDR range</Label>
            <Input
              id="cidr-range"
              value={cidrRange}
              onChange={(e) => setCidrRange(e.target.value)}
              placeholder="10.0.0.0/24"
              required
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cidr-description">Description</Label>
            <Input id="cidr-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label>Applies to</Label>
            <Select value={appliesToRoleId} onValueChange={setAppliesToRoleId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROLES}>All roles</SelectItem>
                {(rolesQuery.data ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !cidrRange.trim()}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
import type { BranchDto, CreateBranchBody, UpdateBranchBody } from '../_lib/types';

export function BranchFormDialog({
  target,
  open,
  onOpenChange,
}: {
  target: 'create' | BranchDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = target !== 'create';

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');

  useEffect(() => {
    if (isEdit) {
      setName(target.name);
      setCode(target.code);
      setAddress(target.address ?? '');
      setCity(target.city ?? '');
      setState(target.state ?? '');
      setCountry(target.country ?? '');
    } else {
      setName('');
      setCode('');
      setAddress('');
      setCity('');
      setState('');
      setCountry('');
    }
  }, [target, isEdit]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] });
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateBranchBody) =>
      apiFetch<BranchDto>('/api/admin/branches', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Branch created');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create branch'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateBranchBody) =>
      apiFetch<BranchDto>(`/api/admin/branches/${isEdit ? target.id : ''}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Branch updated');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update branch'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name,
      code,
      address: address || undefined,
      city: city || undefined,
      state: state || undefined,
      country: country || undefined,
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
          <DialogTitle>{isEdit ? `Edit ${target.name}` : 'New branch'}</DialogTitle>
          <DialogDescription>Physical office location used for branch-scoped record visibility.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name">Name</Label>
              <Input id="branch-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={150} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-code">Code</Label>
              <Input id="branch-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required minLength={2} maxLength={30} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch-address">Address</Label>
            <Input id="branch-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={255} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="branch-city">City</Label>
              <Input id="branch-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-state">State</Label>
              <Input id="branch-state" value={state} onChange={(e) => setState(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-country">Country</Label>
              <Input id="branch-country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={100} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim() || !code.trim()}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { producerTypeLabel } from '@/app/(policy)/lib/format';
import { PRODUCER_STATUSES, PRODUCER_TYPES, type ProducerDto, type ProducerStatus, type ProducerType } from '@/app/(policy)/lib/types';

const NONE = '__none__';

export function ProducerFormDialog({
  open,
  onOpenChange,
  producer,
  producers,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producer?: ProducerDto;
  producers: ProducerDto[];
  users: { id: string; fullName: string; email: string }[];
}) {
  const isEdit = Boolean(producer);
  const queryClient = useQueryClient();

  const [producerCode, setProducerCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<ProducerType>('INTERNAL_BROKER');
  const [status, setStatus] = React.useState<ProducerStatus>('ACTIVE');
  const [licenseNumber, setLicenseNumber] = React.useState('');
  const [licenseExpiry, setLicenseExpiry] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [parentProducerId, setParentProducerId] = React.useState(NONE);
  const [linkedUserId, setLinkedUserId] = React.useState(NONE);

  React.useEffect(() => {
    if (open) {
      setProducerCode(producer?.producerCode ?? '');
      setName(producer?.name ?? '');
      setType(producer?.type ?? 'INTERNAL_BROKER');
      setStatus(producer?.status ?? 'ACTIVE');
      setLicenseNumber(producer?.licenseNumber ?? '');
      setLicenseExpiry(producer?.licenseExpiry ? producer.licenseExpiry.slice(0, 10) : '');
      setPhone(producer?.phone ?? '');
      setEmail(producer?.email ?? '');
      setParentProducerId(producer?.parentProducerId ?? NONE);
      setLinkedUserId(producer?.linkedUserId ?? NONE);
    }
  }, [open, producer]);

  // Excludes itself when editing — a producer can't be its own parent.
  const parentOptions = producers.filter((p) => p.id !== producer?.id);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        producerCode,
        name,
        type,
        status,
        licenseNumber: licenseNumber || undefined,
        licenseExpiry: licenseExpiry || undefined,
        phone: phone || undefined,
        email: email || undefined,
        parentProducerId: parentProducerId === NONE ? undefined : parentProducerId,
        linkedUserId: linkedUserId === NONE ? undefined : linkedUserId,
      };
      const url = isEdit ? `/api/producers/${producer!.id}` : '/api/producers';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to save producer');
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Producer updated' : 'Producer created');
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save producer'),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!producerCode.trim() || !name.trim()) {
      toast.error('Producer code and name are required');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit producer' : 'New producer'}</DialogTitle>
            <DialogDescription>
              A commission-earning party — an internal broker, an external sub-broker, or a correspondent with no TopiaDesk login.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="producer-code">Producer code</Label>
              <Input id="producer-code" value={producerCode} onChange={(e) => setProducerCode(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="producer-name">Name</Label>
              <Input id="producer-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ProducerType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {producerTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProducerStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="license-number">License number</Label>
              <Input id="license-number" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="license-expiry">License expiry</Label>
              <Input id="license-expiry" type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="producer-phone">Phone</Label>
              <Input id="producer-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="producer-email">Email</Label>
              <Input id="producer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reports to (parent producer)</Label>
              <Select value={parentProducerId} onValueChange={setParentProducerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None — top of hierarchy</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Linked user (optional)</Label>
              <Select value={linkedUserId} onValueChange={setLinkedUserId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No TopiaDesk login</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create producer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

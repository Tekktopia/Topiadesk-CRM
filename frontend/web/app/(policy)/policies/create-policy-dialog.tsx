'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { Plus } from 'lucide-react';
import { csrfHeaders } from '@/lib/csrf';
import type { LookupOption, UserOption } from '@/app/(policy)/lib/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const UNASSIGNED = 'UNASSIGNED';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "New policy" creation dialog — POSTs to app/api/policies (CreatePolicyDto:
 * policyNumber/accountId/carrierId/lineOfBusiness/sumInsured?/currency?/
 * inceptionDate/expiryDate/brokerOfRecordId?). Every created policy lands in
 * the backend's default QUOTED status (see policy.controller.ts's create());
 * moving further through the lifecycle happens via the detail page's
 * lifecycle-actions, not here. Follows this module's own dialog convention
 * (local state + fetch — see upload-document-dialog.tsx / record-payment-
 * dialog.tsx) rather than the (crm) module's react-hook-form+zod one, since
 * every existing (policy) dialog already takes this simpler shape.
 */
export function CreatePolicyDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [policyNumber, setPolicyNumber] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [carrierId, setCarrierId] = React.useState('');
  const [lineOfBusiness, setLineOfBusiness] = React.useState('');
  const [sumInsured, setSumInsured] = React.useState('');
  const [currency, setCurrency] = React.useState('NGN');
  const [inceptionDate, setInceptionDate] = React.useState(todayIso());
  const [expiryDate, setExpiryDate] = React.useState('');
  const [brokerOfRecordId, setBrokerOfRecordId] = React.useState(UNASSIGNED);
  const [submitting, setSubmitting] = React.useState(false);

  const lookupsQuery = useQuery({
    queryKey: ['policy-lookups'],
    queryFn: () => fetchJson<{ accounts: LookupOption[]; carriers: LookupOption[] }>('/api/policy-lookups'),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const usersQuery = useQuery({
    queryKey: ['identity-users'],
    queryFn: () => fetchJson<UserOption[]>('/api/identity-users'),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  function reset() {
    setPolicyNumber('');
    setAccountId('');
    setCarrierId('');
    setLineOfBusiness('');
    setSumInsured('');
    setCurrency('NGN');
    setInceptionDate(todayIso());
    setExpiryDate('');
    setBrokerOfRecordId(UNASSIGNED);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !carrierId) {
      toast.error('Choose an account and a carrier');
      return;
    }
    if (!expiryDate || new Date(expiryDate) <= new Date(inceptionDate)) {
      toast.error('Expiry date must be after the inception date');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
        body: JSON.stringify({
          policyNumber,
          accountId,
          carrierId,
          lineOfBusiness,
          sumInsured: sumInsured || undefined,
          currency: currency || undefined,
          inceptionDate,
          expiryDate,
          brokerOfRecordId: brokerOfRecordId === UNASSIGNED ? undefined : brokerOfRecordId,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; policyNumber?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to create policy');
      toast.success(`Policy ${body?.policyNumber ?? policyNumber} created.`);
      setOpen(false);
      reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create policy');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden /> New policy
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New policy</DialogTitle>
            <DialogDescription>Create a policy against an existing account and carrier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="policyNumber">Policy number</Label>
              <Input id="policyNumber" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="account">Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="account">
                    <SelectValue placeholder={lookupsQuery.isLoading ? 'Loading…' : 'Choose an account'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(lookupsQuery.data?.accounts ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="carrier">Carrier</Label>
                <Select value={carrierId} onValueChange={setCarrierId}>
                  <SelectTrigger id="carrier">
                    <SelectValue placeholder={lookupsQuery.isLoading ? 'Loading…' : 'Choose a carrier'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(lookupsQuery.data?.carriers ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lineOfBusiness">Line of business</Label>
              <Input
                id="lineOfBusiness"
                placeholder="e.g. Marine Cargo"
                value={lineOfBusiness}
                onChange={(e) => setLineOfBusiness(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sumInsured">Sum insured</Label>
                <Input
                  id="sumInsured"
                  inputMode="decimal"
                  placeholder="Optional — e.g. 50000000.00"
                  value={sumInsured}
                  onChange={(e) => setSumInsured(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inceptionDate">Inception date</Label>
                <Input id="inceptionDate" type="date" value={inceptionDate} onChange={(e) => setInceptionDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expiryDate">Expiry date</Label>
                <Input id="expiryDate" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brokerOfRecord">Broker of record</Label>
              <Select value={brokerOfRecordId} onValueChange={setBrokerOfRecordId}>
                <SelectTrigger id="brokerOfRecord">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {(usersQuery.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

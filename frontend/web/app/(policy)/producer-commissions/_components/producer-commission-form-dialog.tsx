'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { PolicyDto, PremiumDto, ProducerDto } from '@/app/(policy)/lib/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const NONE = '__none__';

/**
 * Create-only — VAT/WHT/commissionAmount/netPayable are plain inputs, not
 * auto-computed. Matches CreateProducerCommissionDto's own comment: VAT/WHT
 * rates are a finance/tax configuration decision out of scope here, so
 * whoever creates the record enters the real figures rather than trusting
 * an invented default rate.
 */
export function ProducerCommissionFormDialog({
  open,
  onOpenChange,
  producers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producers: ProducerDto[];
}) {
  const queryClient = useQueryClient();

  const [commissionNumber, setCommissionNumber] = React.useState('');
  const [policyId, setPolicyId] = React.useState('');
  const [producerId, setProducerId] = React.useState('');
  const [premiumId, setPremiumId] = React.useState(NONE);
  const [premiumBase, setPremiumBase] = React.useState('');
  const [commissionPercent, setCommissionPercent] = React.useState('');
  const [commissionAmount, setCommissionAmount] = React.useState('');
  const [vatAmount, setVatAmount] = React.useState('0');
  const [whtAmount, setWhtAmount] = React.useState('0');
  const [netPayable, setNetPayable] = React.useState('');
  const [period, setPeriod] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setCommissionNumber('');
      setPolicyId('');
      setProducerId('');
      setPremiumId(NONE);
      setPremiumBase('');
      setCommissionPercent('');
      setCommissionAmount('');
      setVatAmount('0');
      setWhtAmount('0');
      setNetPayable('');
      setPeriod('');
    }
  }, [open]);

  const policiesQuery = useQuery({
    queryKey: ['policies-lookup'],
    queryFn: () => fetchJson<PolicyDto[]>('/api/policies'),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const premiumsQuery = useQuery({
    queryKey: ['policy-premiums', policyId],
    queryFn: () => fetchJson<PremiumDto[]>(`/api/policies/${policyId}/premiums`),
    enabled: open && Boolean(policyId),
  });

  const policies = policiesQuery.data ?? [];
  const premiums = premiumsQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        commissionNumber,
        policyId,
        producerId,
        premiumId: premiumId === NONE ? undefined : premiumId,
        premiumBase,
        commissionPercent,
        commissionAmount,
        vatAmount: vatAmount || undefined,
        whtAmount: whtAmount || undefined,
        netPayable,
        period,
      };
      const res = await fetch('/api/producer-commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to create commission');
    },
    onSuccess: () => {
      toast.success('Commission created');
      queryClient.invalidateQueries({ queryKey: ['producer-commissions'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create commission'),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commissionNumber.trim() || !policyId || !producerId || !premiumBase || !commissionPercent || !commissionAmount || !netPayable || !period.trim()) {
      toast.error('Fill in all required fields');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New producer commission</DialogTitle>
            <DialogDescription>What a producer is owed for a policy/premium — enter the real VAT/WHT withheld, nothing is auto-calculated.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="commission-number">Commission number</Label>
              <Input id="commission-number" value={commissionNumber} onChange={(e) => setCommissionNumber(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Policy</Label>
              <Select
                value={policyId}
                onValueChange={(v) => {
                  setPolicyId(v);
                  setPremiumId(NONE);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a policy" />
                </SelectTrigger>
                <SelectContent>
                  {policies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.policyNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Producer</Label>
              <Select value={producerId} onValueChange={setProducerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a producer" />
                </SelectTrigger>
                <SelectContent>
                  {producers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Premium (optional)</Label>
              <Select value={premiumId} onValueChange={setPremiumId} disabled={!policyId}>
                <SelectTrigger>
                  <SelectValue placeholder={policyId ? 'Not tied to a specific installment' : 'Select a policy first'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not tied to a specific installment</SelectItem>
                  {premiums.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      Due {p.dueDate.slice(0, 10)} — {p.grossPremium}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="premium-base">Premium base</Label>
              <Input id="premium-base" inputMode="decimal" value={premiumBase} onChange={(e) => setPremiumBase(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commission-percent">Commission %</Label>
              <Input id="commission-percent" inputMode="decimal" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commission-amount">Commission amount</Label>
              <Input id="commission-amount" inputMode="decimal" value={commissionAmount} onChange={(e) => setCommissionAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period">Period</Label>
              <Input id="period" placeholder="2026-08" value={period} onChange={(e) => setPeriod(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vat-amount">VAT amount</Label>
              <Input id="vat-amount" inputMode="decimal" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wht-amount">WHT amount</Label>
              <Input id="wht-amount" inputMode="decimal" value={whtAmount} onChange={(e) => setWhtAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="net-payable">Net payable</Label>
              <Input id="net-payable" inputMode="decimal" value={netPayable} onChange={(e) => setNetPayable(e.target.value)} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Create commission
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

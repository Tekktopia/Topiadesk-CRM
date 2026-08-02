'use client';

import * as React from 'react';
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
/**
 * Minimal shape this dialog needs — deliberately narrower than the full
 * `PremiumDto` (policies/:id/premiums's response) so the same dialog also
 * accepts a `PremiumAgingRowDto` row (premiums/aging's response, which
 * uses `premiumId` instead of `id` — see the aging view's mapping) without
 * either caller having to fabricate a full PremiumDto's worth of fields.
 */
export interface PaymentTarget {
  id: string;
  dueDate: string | Date;
  status: string;
  grossPremium: string;
  paidAmount: string;
}

/**
 * "Record a payment" action for a Premium — PATCHes paidAmount/paidDate/
 * status via app/api/premiums/:id (PATCH). Shared between the policy
 * detail's Premiums tab and the standalone /premiums aging view so both
 * get the same recording UX.
 */
export function RecordPaymentDialog({ premium, onOpenChange, onSaved }: { premium: PaymentTarget | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [paidAmount, setPaidAmount] = React.useState('');
  const [paidDate, setPaidDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (premium) {
      const outstanding = Number(premium.grossPremium) - Number(premium.paidAmount);
      setPaidAmount(outstanding > 0 ? outstanding.toFixed(2) : premium.grossPremium);
      setPaidDate(new Date().toISOString().slice(0, 10));
    }
  }, [premium]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!premium) return;
    setSubmitting(true);
    try {
      const newPaidTotal = (Number(premium.paidAmount) + Number(paidAmount)).toFixed(2);
      const status = Number(newPaidTotal) >= Number(premium.grossPremium) ? 'PAID' : 'PARTIALLY_PAID';
      const res = await fetch(`/api/premiums/${premium.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAmount: newPaidTotal, paidDate, status }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to record payment');
      toast.success('Payment recorded.');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={premium !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Premium due {premium?.dueDate ? new Date(premium.dueDate).toLocaleDateString('en-GB') : ''} — currently{' '}
              {premium?.status}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="paidAmount">Amount received</Label>
              <Input id="paidAmount" inputMode="decimal" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paidDate">Payment date</Label>
              <Input id="paidDate" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

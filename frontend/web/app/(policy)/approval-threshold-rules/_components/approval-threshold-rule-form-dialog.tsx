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
import type { ApprovalThresholdRule, PolicyVersionType } from '@/app/(policy)/lib/types';

// Only ENDORSEMENT/CANCELLATION are ever actually gated (policy-lifecycle.ts's
// APPROVAL_GATED_VERSION_TYPES) — the other 3 version types are accepted by
// the backend DTO but never evaluated, so they're left out of this picker
// entirely rather than offering a control that silently does nothing.
const GATED_VERSION_TYPES: PolicyVersionType[] = ['ENDORSEMENT', 'CANCELLATION'];

export function ApprovalThresholdRuleFormDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: ApprovalThresholdRule;
}) {
  const isEdit = Boolean(rule);
  const queryClient = useQueryClient();
  const [versionType, setVersionType] = React.useState<PolicyVersionType>('ENDORSEMENT');
  const [minAmount, setMinAmount] = React.useState('');
  const [requiredApprovals, setRequiredApprovals] = React.useState('2');

  React.useEffect(() => {
    if (open) {
      setVersionType(rule?.versionType ?? 'ENDORSEMENT');
      setMinAmount(rule?.minAmount ?? '');
      setRequiredApprovals(String(rule?.requiredApprovals ?? 2));
    }
  }, [open, rule]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        versionType,
        minAmount: minAmount || undefined,
        requiredApprovals: Number(requiredApprovals),
      };
      const url = isEdit ? `/api/policies/approval-threshold-rules/${rule!.id}` : '/api/policies/approval-threshold-rules';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to save rule');
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Rule updated' : 'Rule created');
      queryClient.invalidateQueries({ queryKey: ['approval-threshold-rules'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save rule'),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requiredApprovals || Number(requiredApprovals) < 1) {
      toast.error('Required approvals must be at least 1');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit rule' : 'New approval rule'}</DialogTitle>
            <DialogDescription>Applies the next time a matching policy version is submitted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Version type</Label>
              <Select value={versionType} onValueChange={(v) => setVersionType(v as PolicyVersionType)} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GATED_VERSION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min-amount">Amount at/above (optional)</Label>
              <Input
                id="min-amount"
                inputMode="decimal"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="Leave blank for a catch-all rule"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="required-approvals">Required approvals</Label>
              <Input
                id="required-approvals"
                type="number"
                min={1}
                value={requiredApprovals}
                onChange={(e) => setRequiredApprovals(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { apiFetch, ApiError } from '../../_lib/api';
import type { Plan } from '../../_lib/types';

const DURATIONS = [
  { value: '1', label: '1 month' },
  { value: '3', label: '3 months' },
  { value: '12', label: '12 months' },
] as const;

/** "Generating a license" is a plan + duration applied together — sets
 * currentPeriodEnd to now + duration and (optionally) changes the plan in
 * one action, rather than the two separate steps the existing plan
 * &lt;Select&gt; on the Subscription card already allows. */
export function GenerateLicenseDialog({ tenantId, currentPlanId }: { tenantId: string; currentPlanId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [planId, setPlanId] = React.useState(currentPlanId);
  const [durationMonths, setDurationMonths] = React.useState('12');

  const { data: plans } = useQuery({ queryKey: ['plans'], queryFn: () => apiFetch<Plan[]>('/api/plans') });

  const generate = useMutation({
    mutationFn: () =>
      apiFetch(`/api/tenants/${tenantId}/subscription`, {
        method: 'PATCH',
        body: JSON.stringify({ planId, durationMonths: Number(durationMonths) }),
      }),
    onSuccess: () => {
      toast.success('License generated');
      queryClient.invalidateQueries({ queryKey: ['tenants', tenantId] });
      setOpen(false);
    },
    onError: (err) => toast.error('Could not generate license', { description: err instanceof ApiError ? err.message : undefined }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Generate / renew license
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a license</DialogTitle>
          <DialogDescription>Sets the plan and a new expiry date for this tenant's subscription.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            generate.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted-foreground" htmlFor="license-plan">
              Plan
            </label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="license-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans?.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} ({plan.seatLimit} seats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted-foreground" htmlFor="license-duration">
              Duration
            </label>
            <Select value={durationMonths} onValueChange={setDurationMonths}>
              <SelectTrigger id="license-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={generate.isPending}>
              {generate.isPending ? 'Generating…' : 'Generate license'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

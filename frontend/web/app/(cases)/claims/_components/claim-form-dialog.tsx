'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { CASE_PRIORITIES, casePriorityLabel } from '../../_lib/constants';
import { useCreateClaim, useDirectoryUsers, useLossCauseCategories, usePolicyLookups, useUpdateClaim } from '../../_lib/hooks';
import type { Claim } from '../../_lib/types';

const UNSET = '__unset';

const claimFormSchema = z.object({
  claimNumber: z.string().min(1, 'Claim number is required'),
  policyId: z.string().min(1, 'Policy is required'),
  dateOfLoss: z.string().min(1, 'Date of loss is required'),
  priority: z.enum(CASE_PRIORITIES),
  causeOfLoss: z.string(),
  causeOfLossCategoryId: z.string(),
  reserveAmount: z.string(),
  adjusterId: z.string(),
});

type ClaimFormValues = z.infer<typeof claimFormSchema>;

const DEFAULTS: ClaimFormValues = {
  claimNumber: '',
  policyId: '',
  dateOfLoss: '',
  priority: 'MEDIUM',
  causeOfLoss: '',
  causeOfLossCategoryId: '',
  reserveAmount: '',
  adjusterId: '',
};

/** Backend Dates arrive as full ISO timestamps (e.g. "2026-08-01T00:00:00.000Z") — `<input type="date">` needs just the date part. */
function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function defaultsFor(claim?: Claim): ClaimFormValues {
  if (!claim) return DEFAULTS;
  return {
    claimNumber: claim.claimNumber,
    policyId: claim.policyId,
    dateOfLoss: toDateInputValue(claim.dateOfLoss),
    priority: claim.priority,
    causeOfLoss: claim.causeOfLoss ?? '',
    causeOfLossCategoryId: claim.causeOfLossCategoryId ?? '',
    reserveAmount: claim.reserveAmount ?? '',
    adjusterId: claim.adjusterId ?? '',
  };
}

/**
 * "New claim" / "Edit claim" dialog — passing `claim` switches this to edit
 * mode, mirroring case-form-dialog.tsx's create-vs-edit pattern. claimNumber/
 * policyId/dateOfLoss are all immutable post-creation (UpdateClaimDto/
 * ClaimMutableFieldsDto in claim.dto.ts excludes all three — see its own
 * doc comment), so those three fields are disabled in edit mode; status
 * changes (including SETTLED/REPUDIATED, which need amount/reason context)
 * stay on claim-lifecycle-actions.tsx's dedicated flow, not this form.
 * policyId/causeOfLossCategoryId/adjusterId are all optional-selects sourced
 * from live lookups (usePolicyLookups extends app/api/policy-lookups, the
 * Loss Cause Category + directory-user lookups are this module's own).
 */
export function ClaimFormDialog({
  open,
  onOpenChange,
  claim,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claim?: Claim;
}) {
  const isEdit = Boolean(claim);
  const form = useForm<ClaimFormValues>({ resolver: zodResolver(claimFormSchema), values: defaultsFor(claim) });
  const createClaim = useCreateClaim();
  const updateClaim = useUpdateClaim(claim?.id ?? '');
  const isPending = createClaim.isPending || updateClaim.isPending;
  const { policies, isLoading: policiesLoading } = usePolicyLookups();
  const { data: lossCauseCategories } = useLossCauseCategories();
  const { users } = useDirectoryUsers();

  const onSubmit = form.handleSubmit(async (values) => {
    if (isEdit && claim) {
      await updateClaim.mutateAsync({
        priority: values.priority,
        causeOfLoss: values.causeOfLoss || undefined,
        causeOfLossCategoryId: values.causeOfLossCategoryId || undefined,
        reserveAmount: values.reserveAmount || undefined,
        adjusterId: values.adjusterId || undefined,
      });
    } else {
      await createClaim.mutateAsync({
        claimNumber: values.claimNumber,
        policyId: values.policyId,
        dateOfLoss: values.dateOfLoss,
        priority: values.priority,
        causeOfLoss: values.causeOfLoss || undefined,
        causeOfLossCategoryId: values.causeOfLossCategoryId || undefined,
        reserveAmount: values.reserveAmount || undefined,
        adjusterId: values.adjusterId || undefined,
      });
    }
    onOpenChange(false);
    form.reset(DEFAULTS);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit claim' : 'New claim'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Update claim ${claim?.claimNumber}.` : 'Register a claim against a bound policy. Starts in NOTIFIED status.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="claimNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Claim number</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. CLM-2026-00042" {...field} disabled={isEdit} />
                  </FormControl>
                  {isEdit ? <FormDescription>Claim number can’t be changed after creation.</FormDescription> : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="policyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Policy</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={policiesLoading ? 'Loading…' : 'Select a policy'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {policies.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dateOfLoss"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of loss</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} disabled={isEdit} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CASE_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {casePriorityLabel(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="causeOfLoss"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cause of loss</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Burst pipe, water damage" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="causeOfLossCategoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loss cause category</FormLabel>
                  <Select value={field.value || UNSET} onValueChange={(v) => field.onChange(v === UNSET ? '' : v)}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={UNSET}>Uncategorized</SelectItem>
                      {(lossCauseCategories ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="reserveAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reserve amount</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="e.g. 500000.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="adjusterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjuster</FormLabel>
                    <Select value={field.value || UNSET} onValueChange={(v) => field.onChange(v === UNSET ? '' : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={UNSET}>Unassigned</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {users.length === 0 ? (
                      <FormDescription>No directory available for your role — leave unassigned and set it from the claim detail page.</FormDescription>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Create claim'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

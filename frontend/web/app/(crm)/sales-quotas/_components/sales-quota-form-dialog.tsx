'use client';

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
  toast,
} from '@topiadesk/ui';
import { QUOTA_PERIOD_TYPES, QUOTA_SCOPE_TYPES, humanize } from '../../_lib/constants';
import { useCreateSalesQuota, useDirectoryUsers, useUpdateSalesQuota } from '../../_lib/hooks';
import type { SalesQuota } from '../../_lib/types';

const salesQuotaFormSchema = z.object({
  scopeType: z.enum(QUOTA_SCOPE_TYPES),
  userId: z.string(),
  departmentId: z.string(),
  branchId: z.string(),
  periodType: z.enum(QUOTA_PERIOD_TYPES),
  periodStart: z.string().min(1, 'Start date is required'),
  periodEnd: z.string().min(1, 'End date is required'),
  targetAmount: z
    .string()
    .min(1, 'Target amount is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a decimal amount, e.g. 5000000.00'),
  lineOfBusiness: z.string(),
});

type SalesQuotaFormValues = z.infer<typeof salesQuotaFormSchema>;

function defaultsFor(quota?: SalesQuota): SalesQuotaFormValues {
  return {
    scopeType: quota?.scopeType ?? 'USER',
    userId: quota?.userId ?? '',
    departmentId: quota?.departmentId ?? '',
    branchId: quota?.branchId ?? '',
    periodType: quota?.periodType ?? 'MONTH',
    periodStart: quota?.periodStart ? quota.periodStart.slice(0, 10) : '',
    periodEnd: quota?.periodEnd ? quota.periodEnd.slice(0, 10) : '',
    targetAmount: quota?.targetAmount ?? '',
    lineOfBusiness: quota?.lineOfBusiness ?? '',
  };
}

/** Mirrors sales-quotas.controller.ts's assertScopeTargetConsistent — exactly one of userId/departmentId/branchId set, matching scopeType. */
function scopeTargetError(values: SalesQuotaFormValues): string | null {
  const setCount = [values.userId, values.departmentId, values.branchId].filter(Boolean).length;
  if (values.scopeType === 'USER' && !(setCount === 1 && values.userId)) return 'Select a user for a USER-scope quota';
  if (values.scopeType === 'DEPARTMENT' && !(setCount === 1 && values.departmentId)) return 'Enter a department id for a DEPARTMENT-scope quota';
  if (values.scopeType === 'BRANCH' && !(setCount === 1 && values.branchId)) return 'Enter a branch id for a BRANCH-scope quota';
  if (values.scopeType === 'ORG' && setCount !== 0) return 'An ORG-scope quota must not target a user, department, or branch';
  return null;
}

export function SalesQuotaFormDialog({
  open,
  onOpenChange,
  quota,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quota?: SalesQuota;
}) {
  const isEdit = Boolean(quota);
  const form = useForm<SalesQuotaFormValues>({
    resolver: zodResolver(salesQuotaFormSchema),
    values: defaultsFor(quota),
  });
  const { usersById } = useDirectoryUsers();
  const users = Array.from(usersById.values());

  const createQuota = useCreateSalesQuota();
  const updateQuota = useUpdateSalesQuota(quota?.id ?? '');
  const isPending = createQuota.isPending || updateQuota.isPending;

  const scopeType = form.watch('scopeType');

  const onSubmit = form.handleSubmit(async (values) => {
    const scopeError = scopeTargetError(values);
    if (scopeError) {
      toast.error(scopeError);
      return;
    }
    const payload = {
      scopeType: values.scopeType,
      userId: values.scopeType === 'USER' ? values.userId : undefined,
      departmentId: values.scopeType === 'DEPARTMENT' ? values.departmentId : undefined,
      branchId: values.scopeType === 'BRANCH' ? values.branchId : undefined,
      periodType: values.periodType,
      periodStart: values.periodStart,
      periodEnd: values.periodEnd,
      targetAmount: values.targetAmount,
      lineOfBusiness: values.lineOfBusiness || undefined,
    };
    if (isEdit && quota) {
      await updateQuota.mutateAsync(payload);
    } else {
      await createQuota.mutateAsync(payload);
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit sales quota' : 'New sales quota'}</DialogTitle>
          <DialogDescription>
            A target amount for a user, department, branch, or the whole org over a period. Writes require an ADMIN-tier
            grant — quotas are assigned by management, not self-service.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="scopeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scope</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {QUOTA_SCOPE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {humanize(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scopeType === 'USER' ? (
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User</FormLabel>
                    {users.length > 0 ? (
                      <Select value={field.value || '__unset'} onValueChange={(v) => field.onChange(v === '__unset' ? '' : v)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__unset">Select a user</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <>
                        <FormControl>
                          <Input placeholder="User UUID" {...field} />
                        </FormControl>
                        <FormDescription>No directory available for your role — paste a user UUID.</FormDescription>
                      </>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {scopeType === 'DEPARTMENT' ? (
              <FormField
                control={form.control}
                name="departmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <FormControl>
                      <Input placeholder="Department UUID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {scopeType === 'BRANCH' ? (
              <FormField
                control={form.control}
                name="branchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch</FormLabel>
                    <FormControl>
                      <Input placeholder="Branch UUID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="periodType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {QUOTA_PERIOD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {humanize(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target (NGN)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 5000000.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="periodStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period start</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period end</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="lineOfBusiness"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Line of business</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional — leave blank for all lines" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Create quota'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

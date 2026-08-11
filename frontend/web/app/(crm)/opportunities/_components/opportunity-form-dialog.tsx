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
import { AccountCombobox, type AccountRef } from '../../_components/account-combobox';
import { CustomFieldsSection, validateCustomFieldValues, type CustomFieldValues } from '../../_components/custom-fields-section';
import { useAllPipelineStages, useCreateOpportunity, useCustomFieldDefinitions, useUpdateOpportunity } from '../../_lib/hooks';
import type { Opportunity } from '../../_lib/types';

const opportunityFormSchema = z.object({
  accountId: z.string().min(1, 'Select an account'),
  name: z.string().min(1, 'Name is required'),
  pipelineId: z.string().min(1, 'Select a pipeline'),
  pipelineStageId: z.string().min(1, 'Select a stage'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a decimal amount, e.g. 45000000.00'),
  currency: z.string().min(1),
  expectedCloseDate: z.string().min(1, 'Expected close date is required'),
  lineOfBusiness: z.string(),
});

type OpportunityFormValues = z.infer<typeof opportunityFormSchema>;

export function OpportunityFormDialog({
  open,
  onOpenChange,
  opportunity,
  accountHint,
  defaultPipelineStageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity?: Opportunity;
  /** Pre-fills the account picker, e.g. when creating from an account's detail page. */
  accountHint?: AccountRef;
  /** Pre-selects a stage, e.g. when creating from a specific Kanban column. */
  defaultPipelineStageId?: string;
}) {
  const isEdit = Boolean(opportunity);
  const { pipelines, stagesById, isLoading: stagesLoading } = useAllPipelineStages();
  const [account, setAccount] = React.useState<AccountRef | null>(accountHint ?? null);

  const defaultStage = defaultPipelineStageId ? stagesById.get(defaultPipelineStageId) : undefined;

  const form = useForm<OpportunityFormValues>({
    resolver: zodResolver(opportunityFormSchema),
    defaultValues: {
      accountId: opportunity?.accountId ?? accountHint?.id ?? '',
      name: opportunity?.name ?? '',
      pipelineId: defaultStage?.pipelineId ?? '',
      pipelineStageId: opportunity?.pipelineStageId ?? defaultPipelineStageId ?? '',
      amount: opportunity?.amount ?? '',
      currency: opportunity?.currency ?? 'NGN',
      expectedCloseDate: opportunity?.expectedCloseDate ? opportunity.expectedCloseDate.slice(0, 10) : '',
      lineOfBusiness: opportunity?.lineOfBusiness ?? '',
    },
  });

  // Resolve pipelineId once stages are loaded, for both edit (from the opportunity's current stage) and create.
  React.useEffect(() => {
    if (stagesLoading || form.getValues('pipelineId')) return;
    const stageId = opportunity?.pipelineStageId ?? defaultPipelineStageId;
    const stage = stageId ? stagesById.get(stageId) : undefined;
    if (stage) {
      form.setValue('pipelineId', stage.pipelineId);
    } else if (pipelines.length > 0) {
      form.setValue('pipelineId', pipelines[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagesLoading, pipelines]);

  const pipelineId = form.watch('pipelineId');
  const stagesForPipeline = Array.from(stagesById.values())
    .filter((s) => s.pipelineId === pipelineId)
    .sort((a, b) => a.order - b.order);

  React.useEffect(() => {
    if (stagesForPipeline.length === 0) return;
    const current = form.getValues('pipelineStageId');
    if (!current || !stagesForPipeline.some((s) => s.id === current)) {
      form.setValue('pipelineStageId', stagesForPipeline[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, stagesById]);

  const { data: customFieldDefinitions } = useCustomFieldDefinitions('OPPORTUNITY');
  const [customFields, setCustomFields] = React.useState<CustomFieldValues>(opportunity?.customFields ?? {});
  React.useEffect(() => {
    setCustomFields(opportunity?.customFields ?? {});
  }, [opportunity]);

  const createOpportunity = useCreateOpportunity();
  const updateOpportunity = useUpdateOpportunity(opportunity?.id ?? '');
  const isPending = createOpportunity.isPending || updateOpportunity.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const customFieldError = validateCustomFieldValues(customFieldDefinitions, customFields, !isEdit);
    if (customFieldError) {
      toast.error(customFieldError);
      return;
    }
    const hasActiveCustomFields = (customFieldDefinitions ?? []).some((d) => d.isActive);
    const payload = {
      accountId: values.accountId,
      name: values.name,
      pipelineStageId: values.pipelineStageId,
      amount: values.amount,
      currency: values.currency,
      expectedCloseDate: new Date(values.expectedCloseDate).toISOString(),
      lineOfBusiness: values.lineOfBusiness || undefined,
      customFields: hasActiveCustomFields ? customFields : undefined,
    };
    if (isEdit && opportunity) {
      await updateOpportunity.mutateAsync(payload);
    } else {
      await createOpportunity.mutateAsync(payload);
    }
    onOpenChange(false);
    setCustomFields({});
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit opportunity' : 'New opportunity'}</DialogTitle>
          <DialogDescription>A prospective piece of business you&apos;re tracking through the pipeline.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            {!isEdit ? (
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account</FormLabel>
                    <FormControl>
                      <AccountCombobox
                        value={account}
                        onChange={(a) => {
                          setAccount(a);
                          field.onChange(a?.id ?? '');
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opportunity name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="pipelineId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pipeline</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={stagesLoading ? 'Loading…' : 'Select pipeline'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {pipelines.map((p) => (
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
              <FormField
                control={form.control}
                name="pipelineStageId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stagesForPipeline.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-[2fr_1fr] gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 45000000.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <Input maxLength={3} {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="expectedCloseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected close</FormLabel>
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
                    <Input placeholder="e.g. Property" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <CustomFieldsSection entityType="OPPORTUNITY" values={customFields} onChange={setCustomFields} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || (!isEdit && !account)}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Create opportunity'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

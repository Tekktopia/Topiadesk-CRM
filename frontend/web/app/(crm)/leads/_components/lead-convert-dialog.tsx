'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Badge,
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
} from '@topiadesk/ui';
import { AccountCombobox, type AccountRef } from '../../_components/account-combobox';
import { ACCOUNT_TYPES } from '../../_lib/constants';
import { useAllPipelineStages, useConvertLead } from '../../_lib/hooks';
import { fullName } from '../../_lib/format';
import type { Lead } from '../../_lib/types';

const convertFormSchema = z
  .object({
    mode: z.enum(['new', 'existing']),
    accountName: z.string(),
    accountType: z.enum(ACCOUNT_TYPES),
    industryId: z.string(),
    opportunityName: z.string().min(1, 'Opportunity name is required'),
    pipelineId: z.string().min(1, 'Select a pipeline'),
    pipelineStageId: z.string().min(1, 'Select a stage'),
    amount: z
      .string()
      .min(1, 'Amount is required')
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter a decimal amount, e.g. 45000000.00'),
    expectedCloseDate: z.string().min(1, 'Expected close date is required'),
    lineOfBusiness: z.string(),
  })
  .refine((data) => data.mode !== 'new' || data.accountName.trim().length > 0, {
    message: 'Enter a name for the new account',
    path: ['accountName'],
  });

type ConvertFormValues = z.infer<typeof convertFormSchema>;

function defaultOpportunityName(lead: Lead): string {
  return `${lead.companyName ?? fullName(lead.firstName, lead.lastName)} — New Business`;
}

export function LeadConvertDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
}) {
  const router = useRouter();
  const [existingAccount, setExistingAccount] = React.useState<AccountRef | null>(null);
  const { pipelines, stagesById, isLoading: pipelinesLoading } = useAllPipelineStages();
  const convertLead = useConvertLead(lead.id);

  const form = useForm<ConvertFormValues>({
    resolver: zodResolver(convertFormSchema),
    defaultValues: {
      mode: 'new',
      accountName: lead.companyName ?? fullName(lead.firstName, lead.lastName),
      accountType: lead.companyName ? 'CORPORATE' : 'INDIVIDUAL',
      industryId: '',
      opportunityName: defaultOpportunityName(lead),
      pipelineId: '',
      pipelineStageId: '',
      amount: '',
      expectedCloseDate: '',
      lineOfBusiness: '',
    },
  });

  const mode = form.watch('mode');
  const pipelineId = form.watch('pipelineId');
  const pipelineStageId = form.watch('pipelineStageId');
  const accountName = form.watch('accountName');

  // Default to the first pipeline once the list loads.
  React.useEffect(() => {
    if (!pipelinesLoading && pipelines.length > 0 && !form.getValues('pipelineId')) {
      form.setValue('pipelineId', pipelines[0]!.id);
    }
  }, [pipelinesLoading, pipelines, form]);

  const stagesForPipeline = Array.from(stagesById.values())
    .filter((s) => s.pipelineId === pipelineId)
    .sort((a, b) => a.order - b.order);

  // Default to the first stage whenever the pipeline changes.
  React.useEffect(() => {
    if (stagesForPipeline.length === 0) return;
    const current = form.getValues('pipelineStageId');
    if (!current || !stagesForPipeline.some((s) => s.id === current)) {
      form.setValue('pipelineStageId', stagesForPipeline[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, stagesById]);

  const selectedStage = stagesById.get(pipelineStageId);
  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await convertLead.mutateAsync({
      existingAccountId: values.mode === 'existing' ? existingAccount?.id : undefined,
      accountName: values.mode === 'new' ? values.accountName : undefined,
      accountType: values.mode === 'new' ? values.accountType : undefined,
      industryId: values.mode === 'new' && values.industryId ? values.industryId : undefined,
      opportunityName: values.opportunityName,
      pipelineStageId: values.pipelineStageId,
      amount: values.amount,
      expectedCloseDate: new Date(values.expectedCloseDate).toISOString(),
      lineOfBusiness: values.lineOfBusiness || undefined,
    });
    onOpenChange(false);
    router.push(`/opportunities/${result.opportunityId}`);
  });

  const accountSummaryLabel = mode === 'existing' ? existingAccount?.name : accountName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convert lead</DialogTitle>
          <DialogDescription>
            Convert <span className="font-medium text-foreground">{fullName(lead.firstName, lead.lastName)}</span> into
            an account and opportunity.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-5">
            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">Account</h3>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    className="h-4 w-4 accent-primary"
                    checked={mode === 'new'}
                    onChange={() => form.setValue('mode', 'new')}
                  />
                  Create a new account
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    className="h-4 w-4 accent-primary"
                    checked={mode === 'existing'}
                    onChange={() => form.setValue('mode', 'existing')}
                  />
                  Link to an existing account
                </label>
              </div>

              {mode === 'new' ? (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="accountName"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>New account name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ACCOUNT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type === 'CORPORATE' ? 'Corporate' : 'Individual'}
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
                    name="industryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional UUID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Existing account</label>
                  <AccountCombobox value={existingAccount} onChange={setExistingAccount} />
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">Opportunity</h3>
              <FormField
                control={form.control}
                name="opportunityName"
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
                            <SelectValue placeholder={pipelinesLoading ? 'Loading…' : 'Select pipeline'} />
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
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (NGN)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 45000000.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
            </section>

            <section className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm">
              <h3 className="font-semibold text-foreground">This will:</h3>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                <li>
                  {mode === 'new' ? 'Create account' : 'Link to existing account'}{' '}
                  <span className="font-medium text-foreground">{accountSummaryLabel || '—'}</span>
                </li>
                <li>
                  Create opportunity <span className="font-medium text-foreground">{form.watch('opportunityName') || '—'}</span>{' '}
                  in stage{' '}
                  <Badge variant="outline" className="align-middle">
                    {selectedStage?.name ?? '—'}
                  </Badge>{' '}
                  ({selectedPipeline?.name ?? '—'})
                </li>
                <li>
                  Mark lead <span className="font-medium text-foreground">{fullName(lead.firstName, lead.lastName)}</span> as{' '}
                  <Badge variant="default">CONVERTED</Badge>
                </li>
              </ul>
            </section>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={convertLead.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={convertLead.isPending || (mode === 'existing' && !existingAccount)}>
                {convertLead.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight aria-hidden />}
                Convert lead
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

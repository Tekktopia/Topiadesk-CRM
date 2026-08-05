'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
import { channelLabel } from '../../_lib/constants';
import { apiFetch } from '../../_lib/api';
import { formatDateTime } from '../../_lib/format';
import { useAudienceSegments, useCampaignTemplates, useCreateCampaign, usePreviewAudienceSegment } from '../../_lib/hooks';
import type { Campaign } from '../../_lib/types';

const campaignFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    segmentId: z.string().min(1, 'Choose an audience segment'),
    templateId: z.string().min(1, 'Choose a template'),
    timing: z.enum(['DRAFT', 'NOW', 'LATER']),
    scheduledSendAt: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.timing === 'LATER' && !values.scheduledSendAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick a date and time', path: ['scheduledSendAt'] });
    }
  });

type CampaignFormValues = z.infer<typeof campaignFormSchema>;

const DEFAULT_VALUES: CampaignFormValues = { name: '', segmentId: '', templateId: '', timing: 'DRAFT', scheduledSendAt: '' };

/**
 * Two-step "New campaign" flow: step 1 collects name/template/segment/timing,
 * step 2 (only reached for NOW/LATER, never for a plain DRAFT save) shows an
 * estimated recipient count and an explicit "this sends real messages,
 * cannot be undone" confirmation before actually creating + triggering —
 * same confirmation bar as the campaign detail page's Send/Schedule action
 * (see campaigns/[id]/_components/send-schedule-dialog.tsx), just reached
 * from a different entry point.
 */
export function CampaignFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [step, setStep] = React.useState<'form' | 'confirm'>('form');
  const form = useForm<CampaignFormValues>({ resolver: zodResolver(campaignFormSchema), defaultValues: DEFAULT_VALUES });

  const segmentsQuery = useAudienceSegments();
  const templatesQuery = useCampaignTemplates();
  const createCampaign = useCreateCampaign();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const segmentId = form.watch('segmentId');
  const templateId = form.watch('templateId');
  const timing = form.watch('timing');
  const scheduledSendAt = form.watch('scheduledSendAt');
  const selectedTemplate = templatesQuery.data?.find((t) => t.id === templateId);
  const selectedSegment = segmentsQuery.data?.find((s) => s.id === segmentId);

  const previewSegment = usePreviewAudienceSegment(segmentId || 'unknown');
  const { mutate: runPreview } = previewSegment;

  React.useEffect(() => {
    if (!open) {
      setStep('form');
      form.reset(DEFAULT_VALUES);
    }
  }, [open, form]);

  React.useEffect(() => {
    if (step === 'confirm' && segmentId) runPreview(undefined);
    // Only re-estimate when actually entering the confirm step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleCreate() {
    const values = form.getValues();
    if (!selectedTemplate) return;
    setIsSubmitting(true);
    try {
      const campaign = await createCampaign.mutateAsync({
        name: values.name,
        channel: selectedTemplate.channel,
        templateId: values.templateId,
        segmentId: values.segmentId,
      });
      await triggerTiming(campaign, values);
      onOpenChange(false);
      router.push(`/campaigns/${campaign.id}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function triggerTiming(campaign: Campaign, values: CampaignFormValues) {
    if (values.timing === 'NOW') {
      await apiFetch(`/api/campaigns/${campaign.id}/send`, { method: 'POST' });
    } else if (values.timing === 'LATER') {
      await apiFetch(`/api/campaigns/${campaign.id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ scheduledSendAt: new Date(values.scheduledSendAt).toISOString() }),
      });
    }
    // DRAFT: nothing further — campaign stays exactly as created.
  }

  const goToConfirm = form.handleSubmit(() => setStep('confirm'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        {step === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle>New campaign</DialogTitle>
              <DialogDescription>Pick a template and audience, then choose when it should go out.</DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={goToConfirm} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. October motor renewal push" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="templateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(templatesQuery.data ?? [])
                            .filter((t) => t.isActive)
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name} · {channelLabel(t.channel)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {selectedTemplate ? (
                        <p className="text-xs text-muted-foreground">
                          Channel: <Badge variant="outline">{channelLabel(selectedTemplate.channel)}</Badge> (inherited from the template)
                        </p>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="segmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Audience segment</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an audience segment" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(segmentsQuery.data ?? []).map((s) => (
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

                <FormField
                  control={form.control}
                  name="timing"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>When</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="DRAFT">Save as draft — decide later</SelectItem>
                          <SelectItem value="NOW">Send now</SelectItem>
                          <SelectItem value="LATER">Schedule for later</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {timing === 'LATER' ? (
                  <FormField
                    control={form.control}
                    name="scheduledSendAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Send at</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">{timing === 'DRAFT' ? 'Create campaign' : 'Continue'}</Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm {timing === 'NOW' ? 'send' : 'schedule'}</DialogTitle>
              <DialogDescription>Review before this campaign is created and {timing === 'NOW' ? 'sent' : 'scheduled'}.</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 rounded-md border border-border p-4 text-sm">
              <Row label="Name" value={form.getValues('name')} />
              <Row label="Channel" value={selectedTemplate ? channelLabel(selectedTemplate.channel) : '—'} />
              <Row label="Template" value={selectedTemplate?.name ?? '—'} />
              <Row label="Audience segment" value={selectedSegment?.name ?? '—'} />
              <Row
                label="Estimated recipients"
                value={
                  previewSegment.isPending
                    ? 'Estimating…'
                    : previewSegment.data
                      ? `~${previewSegment.data.count.toLocaleString()} contacts`
                      : '—'
                }
              />
              <Row label="Timing" value={timing === 'NOW' ? 'Immediately' : formatDateTime(scheduledSendAt)} />
            </div>

            <p className="text-sm font-medium text-destructive">
              {timing === 'NOW'
                ? 'This sends real messages to the estimated audience above as soon as the campaign is created. This cannot be undone.'
                : 'This schedules a real send to the estimated audience above at the chosen time. Once it fires, it cannot be undone (it can still be paused or cancelled before then).'}
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep('form')} disabled={isSubmitting}>
                <ArrowLeft aria-hidden /> Back
              </Button>
              <Button type="button" variant="destructive" onClick={handleCreate} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {timing === 'NOW' ? 'Create & send now' : 'Create & schedule'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

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
import { CAMPAIGN_CHANNELS, channelLabel } from '../../../_lib/constants';
import { extractUsedMergeFieldKeys, substituteMergeFieldsPreview } from '../../../_lib/format';
import { useCreateCampaignTemplate, useMergeFields, useUpdateCampaignTemplate } from '../../../_lib/hooks';
import type { CampaignTemplate } from '../../../_lib/types';

const templateFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    channel: z.enum(CAMPAIGN_CHANNELS),
    subject: z.string(),
    body: z.string(),
    whatsappTemplateName: z.string(),
    whatsappTemplateLang: z.string(),
    isActive: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.channel === 'WHATSAPP' && !values.whatsappTemplateName.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required for WhatsApp templates', path: ['whatsappTemplateName'] });
    }
  });

type TemplateFormValues = z.infer<typeof templateFormSchema>;

function defaultsFor(template?: CampaignTemplate): TemplateFormValues {
  return {
    name: template?.name ?? '',
    channel: template?.channel ?? 'EMAIL',
    subject: template?.subject ?? '',
    body: template?.bodyHtml ?? template?.bodyText ?? '',
    whatsappTemplateName: template?.whatsappTemplateName ?? '',
    whatsappTemplateLang: template?.whatsappTemplateLang ?? '',
    isActive: template?.isActive ?? true,
  };
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: CampaignTemplate;
}) {
  const isEdit = Boolean(template);
  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    values: defaultsFor(template),
  });
  const mergeFieldsQuery = useMergeFields();

  const createTemplate = useCreateCampaignTemplate();
  const updateTemplate = useUpdateCampaignTemplate(template?.id ?? '');
  const isPending = createTemplate.isPending || updateTemplate.isPending;

  const channel = form.watch('channel');
  const subject = form.watch('subject');
  const body = form.watch('body');
  const knownKeys = React.useMemo(() => (mergeFieldsQuery.data ?? []).map((f) => f.key), [mergeFieldsQuery.data]);
  const preview = React.useMemo(
    () => substituteMergeFieldsPreview(`${channel === 'EMAIL' ? `Subject: ${subject}\n\n` : ''}${body}`, mergeFieldsQuery.data ?? []),
    [channel, subject, body, mergeFieldsQuery.data],
  );

  function insertMergeField(key: string) {
    form.setValue('body', `${form.getValues('body')}{{${key}}}`, { shouldDirty: true });
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const mergeFields = extractUsedMergeFieldKeys(`${values.subject}\n${values.body}`, knownKeys);
    const payload = {
      name: values.name,
      channel: values.channel,
      subject: values.channel === 'EMAIL' ? values.subject || undefined : undefined,
      bodyHtml: values.channel === 'EMAIL' ? values.body || undefined : undefined,
      bodyText: values.channel !== 'EMAIL' ? values.body || undefined : undefined,
      mergeFields,
      whatsappTemplateName: values.channel === 'WHATSAPP' ? values.whatsappTemplateName || undefined : undefined,
      whatsappTemplateLang: values.channel === 'WHATSAPP' ? values.whatsappTemplateLang || undefined : undefined,
      isActive: values.isActive,
    };
    if (isEdit && template) {
      await updateTemplate.mutateAsync(payload);
    } else {
      await createTemplate.mutateAsync(payload);
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit template' : 'New template'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this message template.' : 'Create a reusable Email, SMS, or WhatsApp message template.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Renewal reminder — 30 days" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CAMPAIGN_CHANNELS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {channelLabel(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {channel === 'EMAIL' ? (
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Your {{policy.lineOfBusiness}} policy renews soon" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {channel === 'WHATSAPP' ? (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="whatsappTemplateName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp template name</FormLabel>
                      <FormControl>
                        <Input placeholder="Pre-approved WhatsApp Business template" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="whatsappTemplateLang"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template language</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. en" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Body</FormLabel>
                  <FormControl>
                    <textarea
                      rows={6}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-brand-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      placeholder="Hi {{contact.firstName}}, your {{policy.lineOfBusiness}} policy renews on {{policy.renewalDueDate}}…"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Use <code className="rounded bg-muted px-1 py-0.5">{'{{key}}'}</code> placeholders — click a field below to
                    insert it. Values are substituted per-recipient when the campaign sends.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-foreground">Available merge fields</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(mergeFieldsQuery.data ?? []).map((f) => (
                  <Button key={f.key} type="button" variant="outline" size="sm" className="font-mono text-xs" onClick={() => insertMergeField(f.key)}>
                    {`{{${f.key}}}`}
                  </Button>
                ))}
              </div>
            </div>

            {(subject || body) ? (
              <div className="rounded-md border border-dashed border-border bg-muted/40 p-3">
                <p className="mb-1.5 text-xs font-medium text-foreground">Preview with sample data</p>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">{preview}</pre>
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    Active
                  </label>
                  <FormDescription>Inactive templates stay usable on existing campaigns but can&apos;t be picked for new ones.</FormDescription>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Create template'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

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
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { CustomFieldsSection, validateCustomFieldValues, type CustomFieldValues } from '../../_components/custom-fields-section';
import { LEAD_SOURCES, LEAD_STATUSES, leadStatusLabel, humanize } from '../../_lib/constants';
import { useCreateLead, useCustomFieldDefinitions, useUpdateLead } from '../../_lib/hooks';
import type { Lead } from '../../_lib/types';

const leadFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  companyName: z.string(),
  email: z.union([z.string().email('Enter a valid email'), z.literal('')]),
  phone: z.string(),
  source: z.enum(LEAD_SOURCES),
  sourceCampaign: z.string(),
  status: z.enum(LEAD_STATUSES),
  score: z.coerce.number().int().min(0).max(100),
  qualificationNotes: z.string(),
});

type LeadFormValues = z.infer<typeof leadFormSchema>;

function defaultsFor(lead?: Lead): LeadFormValues {
  return {
    firstName: lead?.firstName ?? '',
    lastName: lead?.lastName ?? '',
    companyName: lead?.companyName ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone ?? '',
    source: lead?.source ?? 'WEB',
    sourceCampaign: lead?.sourceCampaign ?? '',
    status: lead?.status ?? 'NEW',
    score: lead?.score ?? 0,
    qualificationNotes: lead?.qualificationNotes ?? '',
  };
}

export function LeadFormDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead;
}) {
  const isEdit = Boolean(lead);
  const { user } = useCurrentUser();
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    values: defaultsFor(lead),
  });

  const { data: customFieldDefinitions } = useCustomFieldDefinitions('LEAD');
  const [customFields, setCustomFields] = React.useState<CustomFieldValues>(lead?.customFields ?? {});
  React.useEffect(() => {
    setCustomFields(lead?.customFields ?? {});
  }, [lead]);

  const createLead = useCreateLead();
  const updateLead = useUpdateLead(lead?.id ?? '');
  const isPending = createLead.isPending || updateLead.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const customFieldError = validateCustomFieldValues(customFieldDefinitions, customFields, !isEdit);
    if (customFieldError) {
      toast.error(customFieldError);
      return;
    }
    const hasActiveCustomFields = (customFieldDefinitions ?? []).some((d) => d.isActive);
    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      companyName: values.companyName || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      source: values.source,
      sourceCampaign: values.sourceCampaign || undefined,
      status: values.status,
      score: values.score,
      qualificationNotes: values.qualificationNotes || undefined,
      customFields: hasActiveCustomFields ? customFields : undefined,
    };
    if (isEdit && lead) {
      await updateLead.mutateAsync(payload);
    } else {
      await createLead.mutateAsync({ ...payload, assignedToId: user?.id });
    }
    onOpenChange(false);
    setCustomFields({});
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit lead' : 'New lead'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Update this lead’s details.' : 'Capture a new prospect.'}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company</FormLabel>
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {humanize(s)}
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEAD_STATUSES.filter((s) => s !== 'CONVERTED').map((s) => (
                          <SelectItem key={s} value={s}>
                            {leadStatusLabel(s)}
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
              name="score"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Score (0–100)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="qualificationNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qualification notes</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <CustomFieldsSection entityType="LEAD" values={customFields} onChange={setCustomFields} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Create lead'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

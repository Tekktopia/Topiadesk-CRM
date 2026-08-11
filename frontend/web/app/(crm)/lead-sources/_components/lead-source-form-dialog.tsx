'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input } from '@topiadesk/ui';
import { useCreateLeadSource, useUpdateLeadSource } from '../../_lib/hooks';
import type { LeadSourceOption } from '../../_lib/types';

const leadSourceFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z
    .string()
    .min(1, 'Code is required')
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Upper-case letters, digits, and underscores only, e.g. TRADE_SHOW'),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int(),
});

type LeadSourceFormValues = z.infer<typeof leadSourceFormSchema>;

function defaultsFor(source?: LeadSourceOption): LeadSourceFormValues {
  return {
    name: source?.name ?? '',
    code: source?.code ?? '',
    isActive: source?.isActive ?? true,
    sortOrder: source?.sortOrder ?? 0,
  };
}

export function LeadSourceFormDialog({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: LeadSourceOption;
}) {
  const isEdit = Boolean(source);
  const form = useForm<LeadSourceFormValues>({ resolver: zodResolver(leadSourceFormSchema), values: defaultsFor(source) });

  const createSource = useCreateLeadSource();
  const updateSource = useUpdateLeadSource(source?.id ?? '');
  const isPending = createSource.isPending || updateSource.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    if (isEdit && source) {
      await updateSource.mutateAsync({ name: values.name, isActive: values.isActive, sortOrder: values.sortOrder });
    } else {
      await createSource.mutateAsync({ name: values.name, code: values.code, isActive: values.isActive, sortOrder: values.sortOrder });
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit lead source' : 'New lead source'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Name, order, and active status can change — the code is fixed once leads exist under it.' : 'Adds an option to the Lead source dropdown.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Trade Show" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. TRADE_SHOW" {...field} disabled={isEdit} className="font-mono" />
                  </FormControl>
                  <FormDescription>The stable value stored on each Lead — cannot change once set.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort order</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormDescription>Lower numbers render first in the dropdown.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                    Active (shown on the Lead form)
                  </label>
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
                {isEdit ? 'Save changes' : 'Create source'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

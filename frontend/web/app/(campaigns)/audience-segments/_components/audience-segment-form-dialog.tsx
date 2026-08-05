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
} from '@topiadesk/ui';
import { SegmentFilterBuilder } from '../../_components/segment-filter-builder';
import { SegmentPreviewDialog } from '../../_components/segment-preview-dialog';
import { useCreateAudienceSegment, useUpdateAudienceSegment } from '../../_lib/hooks';
import type { AudienceSegment, SegmentFilterGroup } from '../../_lib/types';

const DEFAULT_FILTERS: SegmentFilterGroup = { match: 'ALL', conditions: [] };

const segmentFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string(),
  isDynamic: z.boolean(),
});

type SegmentFormValues = z.infer<typeof segmentFormSchema>;

function defaultsFor(segment?: AudienceSegment): SegmentFormValues {
  return {
    name: segment?.name ?? '',
    description: segment?.description ?? '',
    isDynamic: segment?.isDynamic ?? true,
  };
}

export function AudienceSegmentFormDialog({
  open,
  onOpenChange,
  segment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment?: AudienceSegment;
}) {
  const isEdit = Boolean(segment);
  const form = useForm<SegmentFormValues>({
    resolver: zodResolver(segmentFormSchema),
    values: defaultsFor(segment),
  });
  // Initializer-only — relies on the parent conditionally (re)mounting this
  // dialog per edit target (see AudienceSegmentsListView), same convention
  // app/(crm)/accounts/_components/account-form-dialog.tsx's react-hook-form
  // `values` reset relies on for its own fields.
  const [filters, setFilters] = React.useState<SegmentFilterGroup>(segment?.filters ?? DEFAULT_FILTERS);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const createSegment = useCreateAudienceSegment();
  const updateSegment = useUpdateAudienceSegment(segment?.id ?? '');
  const isPending = createSegment.isPending || updateSegment.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      description: values.description || undefined,
      isDynamic: values.isDynamic,
      filters,
    };
    if (isEdit && segment) {
      await updateSegment.mutateAsync(payload);
    } else {
      await createSegment.mutateAsync(payload);
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit audience segment' : 'New audience segment'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this segment’s criteria.'
              : 'Define who a campaign targets — criteria can reach into contact, account, policy, renewal, premium, and opportunity fields.'}
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
                    <Input placeholder="e.g. Motor renewals due in 60 days" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDynamic"
              render={({ field }) => (
                <FormItem>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    Dynamic segment
                  </label>
                  <FormDescription>
                    Dynamic segments re-evaluate membership at send time. Non-dynamic segments are frozen the moment a
                    campaign using them is scheduled.
                  </FormDescription>
                </FormItem>
              )}
            />

            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Criteria</p>
              <SegmentFilterBuilder value={filters} onChange={setFilters} />
            </div>

            <DialogFooter className="sm:justify-between">
              {isEdit && segment ? (
                <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
                  Preview count
                </Button>
              ) : (
                <p className="self-center text-xs text-muted-foreground">Save this segment first to preview matching contacts.</p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {isEdit ? 'Save changes' : 'Create segment'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      {isEdit && segment ? (
        <SegmentPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} segmentId={segment.id} filters={filters} />
      ) : null}
    </Dialog>
  );
}

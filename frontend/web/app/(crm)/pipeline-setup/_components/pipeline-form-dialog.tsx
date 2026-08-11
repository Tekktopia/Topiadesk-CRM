'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from '@topiadesk/ui';
import { useCreatePipeline, useUpdatePipeline } from '../../_lib/hooks';
import type { Pipeline } from '../../_lib/types';

const pipelineFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  lineOfBusiness: z.string(),
  isActive: z.boolean(),
});

type PipelineFormValues = z.infer<typeof pipelineFormSchema>;

function defaultsFor(pipeline?: Pipeline): PipelineFormValues {
  return {
    name: pipeline?.name ?? '',
    lineOfBusiness: pipeline?.lineOfBusiness ?? '',
    isActive: pipeline?.isActive ?? true,
  };
}

export function PipelineFormDialog({ open, onOpenChange, pipeline }: { open: boolean; onOpenChange: (open: boolean) => void; pipeline?: Pipeline }) {
  const isEdit = Boolean(pipeline);
  const form = useForm<PipelineFormValues>({ resolver: zodResolver(pipelineFormSchema), values: defaultsFor(pipeline) });

  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline(pipeline?.id ?? '');
  const isPending = createPipeline.isPending || updatePipeline.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const body = { name: values.name, lineOfBusiness: values.lineOfBusiness || undefined, isActive: values.isActive };
    if (isEdit) {
      await updatePipeline.mutateAsync(body);
    } else {
      await createPipeline.mutateAsync(body);
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit pipeline' : 'New pipeline'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Renaming or deactivating takes effect immediately on the Pipeline board.' : 'Add stages to it once it exists.'}
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
                    <Input placeholder="e.g. New Business" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lineOfBusiness"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Line of business</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional, e.g. Marine" {...field} />
                  </FormControl>
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
                    Active (selectable on the Pipeline board)
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
                {isEdit ? 'Save changes' : 'Create pipeline'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

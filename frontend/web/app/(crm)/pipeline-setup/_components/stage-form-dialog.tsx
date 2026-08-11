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
} from '@topiadesk/ui';
import { useCreatePipelineStage, useUpdatePipelineStage } from '../../_lib/hooks';
import type { PipelineStage } from '../../_lib/types';

const stageFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  defaultProbability: z.coerce.number().int().min(0).max(100),
  isWon: z.boolean(),
  isLost: z.boolean(),
});

type StageFormValues = z.infer<typeof stageFormSchema>;

function defaultsFor(stage?: PipelineStage): StageFormValues {
  return {
    name: stage?.name ?? '',
    defaultProbability: stage?.defaultProbability ?? 20,
    isWon: stage?.isWon ?? false,
    isLost: stage?.isLost ?? false,
  };
}

export function StageFormDialog({
  open,
  onOpenChange,
  pipelineId,
  stage,
  nextOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  stage?: PipelineStage;
  /** Only used when creating — appended to the end of the stage list. */
  nextOrder?: number;
}) {
  const isEdit = Boolean(stage);
  const form = useForm<StageFormValues>({ resolver: zodResolver(stageFormSchema), values: defaultsFor(stage) });

  const createStage = useCreatePipelineStage(pipelineId);
  const updateStage = useUpdatePipelineStage(pipelineId, stage?.id ?? '');
  const isPending = createStage.isPending || updateStage.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    if (isEdit) {
      await updateStage.mutateAsync({
        name: values.name,
        defaultProbability: values.defaultProbability,
        isWon: values.isWon,
        isLost: values.isLost,
      });
    } else {
      await createStage.mutateAsync({
        name: values.name,
        order: nextOrder ?? 0,
        defaultProbability: values.defaultProbability,
        isWon: values.isWon,
        isLost: values.isLost,
      });
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit stage' : 'New stage'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Renaming a stage doesn’t move any opportunities currently sitting in it.' : 'Added to the end of the list — reorder it afterward if needed.'}
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
                    <Input placeholder="e.g. Needs Analysis" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultProbability"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default probability</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} {...field} />
                  </FormControl>
                  <FormDescription>Pre-filled on a new opportunity when it lands in this stage — still editable per-deal.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-2">
              <FormField
                control={form.control}
                name="isWon"
                render={({ field }) => (
                  <FormItem>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={field.value}
                        onChange={(e) => {
                          field.onChange(e.target.checked);
                          if (e.target.checked) form.setValue('isLost', false);
                        }}
                      />
                      This is a &quot;Won&quot; stage
                    </label>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isLost"
                render={({ field }) => (
                  <FormItem>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={field.value}
                        onChange={(e) => {
                          field.onChange(e.target.checked);
                          if (e.target.checked) form.setValue('isWon', false);
                        }}
                      />
                      This is a &quot;Lost&quot; stage
                    </label>
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
                {isEdit ? 'Save changes' : 'Add stage'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

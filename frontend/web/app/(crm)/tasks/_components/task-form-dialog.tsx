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
} from '@topiadesk/ui';
import { AccountCombobox, type AccountRef } from '../../_components/account-combobox';
import { TASK_PRIORITIES, TASK_STATUSES, taskPriorityLabel, taskStatusLabel } from '../../_lib/constants';
import { useAccount, useCreateTask, useUpdateTask } from '../../_lib/hooks';
import type { Task } from '../../_lib/types';

const taskFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string(),
  dueDate: z.string(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

function defaultsFor(task?: Task): TaskFormValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : '',
    priority: task?.priority ?? 'MEDIUM',
    status: task?.status ?? 'OPEN',
  };
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  accountHint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
  accountHint?: AccountRef;
}) {
  const isEdit = Boolean(task);
  const { data: linkedAccount } = useAccount(task?.accountId ?? undefined);
  const [account, setAccount] = React.useState<AccountRef | null>(accountHint ?? null);

  React.useEffect(() => {
    if (linkedAccount) setAccount({ id: linkedAccount.id, name: linkedAccount.name });
  }, [linkedAccount]);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    values: defaultsFor(task),
  });

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const isPending = createTask.isPending || updateTask.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      title: values.title,
      description: values.description || undefined,
      dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
      priority: values.priority,
      status: values.status,
      accountId: account?.id,
    };
    if (isEdit && task) {
      await updateTask.mutateAsync({ id: task.id, input: payload });
    } else {
      await createTask.mutateAsync(payload);
    }
    onOpenChange(false);
    if (!isEdit) setAccount(accountHint ?? null);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Update this task.' : 'Assigned to you by default.'}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Follow up on renewal quote" {...field} />
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
                    <textarea
                      rows={2}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TASK_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {taskPriorityLabel(p)}
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
                        {TASK_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {taskStatusLabel(s)}
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
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Related account (optional)</label>
              <AccountCombobox value={account} onChange={setAccount} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isEdit ? 'Save changes' : 'Create task'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

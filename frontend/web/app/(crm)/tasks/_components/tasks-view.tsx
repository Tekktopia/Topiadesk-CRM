'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { apiFetch, buildQuery } from '../../_lib/api';
import { TASK_STATUSES, taskPriorityLabel, taskPriorityVariant, taskStatusLabel, taskStatusVariant } from '../../_lib/constants';
import { formatDate } from '../../_lib/format';
import { useDeleteTask, useUpdateTask } from '../../_lib/hooks';
import type { Task, TaskQuery } from '../../_lib/types';
import { TaskFormDialog } from './task-form-dialog';

const UNSET = '__any';

function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export function TasksView() {
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Follow-ups, reminders, and to-dos across your book of business."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New task
          </Button>
        }
      />

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My tasks</TabsTrigger>
          <TabsTrigger value="all">All tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <TaskTable scope="mine" />
        </TabsContent>
        <TabsContent value="all">
          <TaskTable scope="all" />
        </TabsContent>
      </Tabs>

      <TaskFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function TaskTable({ scope }: { scope: 'mine' | 'all' }) {
  const [status, setStatus] = React.useState<string>(UNSET);
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [deleting, setDeleting] = React.useState<Task | null>(null);

  const query: TaskQuery = { status: status === UNSET ? undefined : (status as TaskQuery['status']) };
  // A single useQuery call (rather than picking between two resource hooks
  // via `scope`) keeps this unconditional per rules-of-hooks, while the
  // 'mine'/'all' segment of the query key still falls under the ['crm',
  // 'tasks'] prefix every task mutation invalidates.
  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'tasks', scope, query],
    queryFn: () => apiFetch<Task[]>(`/api/crm/tasks${scope === 'mine' ? '/mine' : ''}${buildQuery(query)}`),
  });

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="w-full space-y-1.5 sm:w-48">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>All statuses</SelectItem>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {taskStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="No tasks match these filters" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Linked to</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary"
                      checked={task.status === 'COMPLETED'}
                      disabled={updateTask.isPending}
                      onChange={(e) =>
                        updateTask.mutate({
                          id: task.id,
                          input: { status: e.target.checked ? 'COMPLETED' : 'OPEN' },
                        })
                      }
                      aria-label={`Mark "${task.title}" ${task.status === 'COMPLETED' ? 'open' : 'complete'}`}
                    />
                  </TableCell>
                  <TableCell className={task.status === 'COMPLETED' ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}>
                    {task.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant={taskPriorityVariant(task.priority)}>{taskPriorityLabel(task.priority)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Badge>
                  </TableCell>
                  <TableCell className={isOverdue(task) ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                    {formatDate(task.dueDate)}
                    {isOverdue(task) ? ' (overdue)' : ''}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {task.accountId ? <Link href={`/accounts/${task.accountId}`} className="hover:underline">Account</Link> : '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Task actions">
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(task)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(task)}>
                          <Trash2 aria-hidden /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {editing ? <TaskFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} task={editing} /> : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete task "${deleting?.title}"?`}
        confirmLabel="Delete task"
        destructive
        isPending={deleteTask.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteTask.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </Card>
  );
}

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
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // No bulk actions here (no selection column below), but DataTable's
  // row.getIsSelected() is called unconditionally per row and throws if
  // `rowSelection` state is left undefined instead of `{}` — see the same
  // note in carriers-list-view.tsx.
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const rows = data ?? [];

  const columns = React.useMemo<ColumnDef<Task>[]>(
    () => [
      {
        id: 'complete',
        header: '',
        enableSorting: false,
        enableHiding: false,
        size: 32,
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={row.original.status === 'COMPLETED'}
            disabled={updateTask.isPending}
            onChange={(e) =>
              updateTask.mutate({
                id: row.original.id,
                input: { status: e.target.checked ? 'COMPLETED' : 'OPEN' },
              })
            }
            aria-label={`Mark "${row.original.title}" ${row.original.status === 'COMPLETED' ? 'open' : 'complete'}`}
          />
        ),
      },
      {
        accessorKey: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Title" />,
        meta: { label: 'Title' },
        cell: ({ row }) => (
          <span className={row.original.status === 'COMPLETED' ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}>
            {row.original.title}
          </span>
        ),
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Priority" />,
        meta: { label: 'Priority' },
        cell: ({ row }) => <Badge variant={taskPriorityVariant(row.original.priority)}>{taskPriorityLabel(row.original.priority)}</Badge>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={taskStatusVariant(row.original.status)}>{taskStatusLabel(row.original.status)}</Badge>,
      },
      {
        accessorKey: 'dueDate',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Due" />,
        meta: { label: 'Due' },
        cell: ({ row }) => (
          <span className={isOverdue(row.original) ? 'font-medium text-destructive' : 'text-muted-foreground'}>
            {formatDate(row.original.dueDate)}
            {isOverdue(row.original) ? ' (overdue)' : ''}
          </span>
        ),
        sortingFn: (a, b) => {
          const aTime = a.original.dueDate ? new Date(a.original.dueDate).getTime() : Infinity;
          const bTime = b.original.dueDate ? new Date(b.original.dueDate).getTime() : Infinity;
          return aTime - bTime;
        },
      },
      {
        id: 'linkedTo',
        header: 'Linked to',
        meta: { label: 'Linked to' },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.accountId ? (
            <Link href={`/accounts/${row.original.accountId}`} className="text-muted-foreground hover:underline">
              Account
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Task actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [updateTask],
  );

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

        {!isLoading && rows.length === 0 ? (
          <EmptyState title="No tasks match these filters" />
        ) : (
          <DataTable<Task, unknown>
            columns={columns}
            data={rows}
            getRowId={(t) => t.id}
            isLoading={isLoading}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            pagination={pagination}
            onPaginationChange={setPagination}
            totalRowCount={rows.length}
            enableColumnVisibility
          />
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

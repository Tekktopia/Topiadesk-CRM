'use client';

import * as React from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  Input,
  type RowSelectionState,
  selectionColumn,
} from '@topiadesk/ui';
import { useCreateTask, useDeleteTask, useTasksForEntity, useUpdateTask } from '../../../../(crm)/_lib/hooks';
import { taskPriorityLabel, taskPriorityVariant, taskStatusLabel, taskStatusVariant } from '../../../../(crm)/_lib/constants';
import type { Task } from '../../../../(crm)/_lib/types';
import { ConfirmDialog } from '../../../_components/confirm-dialog';
import { EmptyState } from '../../../_components/empty-state';
import { formatDate } from '../../../_lib/format';
import { useDirectoryUsers } from '../../../_lib/hooks';

/** "Tasks" related-list on the ticket detail page — closes a real backend gap (Task.caseId existed but was never filterable; see (crm)/_lib/hooks.ts's useTasksForEntity doc comment) rather than being purely decorative. Checkbox selection + a small bulk toolbar (mark complete / delete), matching the "all tables should have checkboxes/additional features" ask. */
export function CaseTasksTable({ caseId }: { caseId: string }) {
  const { data: tasks, isLoading } = useTasksForEntity({ caseId });
  const { usersById } = useDirectoryUsers();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [newTitle, setNewTitle] = React.useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  function addTask() {
    if (!newTitle.trim()) return;
    createTask.mutate({ title: newTitle.trim(), caseId }, { onSuccess: () => setNewTitle('') });
  }

  async function markSelectedComplete() {
    await Promise.allSettled(selectedIds.map((id) => updateTask.mutateAsync({ id, input: { status: 'COMPLETED' } })));
    setRowSelection({});
  }

  async function deleteSelected() {
    await Promise.allSettled(selectedIds.map((id) => deleteTask.mutateAsync(id)));
    setRowSelection({});
    setDeleteConfirmOpen(false);
  }

  const columns = React.useMemo<ColumnDef<Task>[]>(
    () => [
      selectionColumn<Task>(),
      {
        accessorKey: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Title" />,
        meta: { label: 'Title' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.title}</span>,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        meta: { label: 'Description' },
        cell: ({ row }) => <span className="block max-w-[240px] truncate text-muted-foreground">{row.original.description || '—'}</span>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={taskStatusVariant(row.original.status)}>{taskStatusLabel(row.original.status)}</Badge>,
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Priority" />,
        meta: { label: 'Priority' },
        cell: ({ row }) => <Badge variant={taskPriorityVariant(row.original.priority)}>{taskPriorityLabel(row.original.priority)}</Badge>,
      },
      {
        accessorKey: 'dueDate',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Due" />,
        meta: { label: 'Due' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.dueDate)}</span>,
      },
      {
        id: 'assignee',
        header: 'Assignee',
        meta: { label: 'Assignee' },
        accessorFn: (t) => usersById.get(t.assigneeId)?.fullName ?? t.assigneeId,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
    ],
    [usersById],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
          placeholder="New task title…"
          className="max-w-xs"
        />
        <Button size="sm" variant="outline" onClick={addTask} disabled={!newTitle.trim() || createTask.isPending}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add task
        </Button>
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/40 px-4 py-2.5">
          <p className="text-sm font-medium text-foreground">{selectedIds.length} selected</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={markSelectedComplete} disabled={updateTask.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Mark complete
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteConfirmOpen(true)} disabled={deleteTask.isPending}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
            </Button>
          </div>
        </div>
      ) : null}

      {!isLoading && tasks.length === 0 ? (
        <EmptyState title="No tasks yet" description="Add a task above to track follow-up work on this ticket." />
      ) : (
        <DataTable<Task, unknown>
          columns={columns}
          data={tasks}
          getRowId={(t) => t.id}
          isLoading={isLoading}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${selectedIds.length} task${selectedIds.length === 1 ? '' : 's'}?`}
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        isPending={deleteTask.isPending}
        onConfirm={deleteSelected}
      />
    </div>
  );
}

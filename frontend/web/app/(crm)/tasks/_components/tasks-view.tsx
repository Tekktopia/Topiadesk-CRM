'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Download, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react';
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
  Input,
  type RowSelectionState,
  selectionColumn,
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
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { BulkActionToolbar } from '../../_components/bulk-action-toolbar';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { apiFetch, buildQuery } from '../../_lib/api';
import { TASK_PRIORITIES, TASK_STATUSES, taskPriorityLabel, taskPriorityVariant, taskStatusLabel, taskStatusVariant } from '../../_lib/constants';
import { formatDate } from '../../_lib/format';
import {
  useBulkAssignTasks,
  useBulkDeleteTasks,
  useDeleteTask,
  useDirectoryUsers,
  useTaskStats,
  useTasksCount,
  useUpdateTask,
} from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { Task, TaskQuery } from '../../_lib/types';
import { TaskFormDialog } from './task-form-dialog';
import { TaskStatsStrip } from './task-stats-strip';

const UNSET = '__any';

/**
 * Named due-date windows rather than two date pickers. These are the three
 * questions anyone actually asks a task list ("what's late", "what's today",
 * "what's this week"), and each maps onto the dueBefore/dueAfter params the
 * backend already accepted but nothing ever sent.
 *
 * Ranges are computed at render time, not module load, so a tab left open
 * across midnight doesn't keep filtering against yesterday's boundaries.
 */
const DUE_WINDOWS = [
  {
    value: 'overdue',
    label: 'Overdue',
    range: () => ({ dueBefore: startOfToday().toISOString(), dueAfter: undefined }),
  },
  {
    value: 'today',
    label: 'Due today',
    range: () => ({ dueAfter: startOfToday().toISOString(), dueBefore: addDays(startOfToday(), 1).toISOString() }),
  },
  {
    value: 'week',
    label: 'Next 7 days',
    range: () => ({ dueAfter: startOfToday().toISOString(), dueBefore: addDays(startOfToday(), 7).toISOString() }),
  },
] as const;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Overdue = due before TODAY, not before "right now".
 *
 * This used to compare against Date.now(), which made a task due at 10:00
 * today read "(overdue)" from 10:01 onward — while the Overdue KPI tile,
 * which counts `dueDate < start of today` server-side, still said 0. The two
 * definitions contradicted each other on the same screen. A calendar-day
 * boundary is also the one the "Due today" / "Overdue" filters use, so all
 * three now agree.
 */
function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
  return new Date(task.dueDate).getTime() < startOfToday().getTime();
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
  const { user } = useCurrentUser();
  const [status, setStatus] = React.useState<string>(UNSET);
  const [priority, setPriority] = React.useState<string>(UNSET);
  const [search, setSearch] = React.useState('');
  const [assignee, setAssignee] = React.useState<string>(UNSET);
  const [dueWindow, setDueWindow] = React.useState<string>(UNSET);
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [deleting, setDeleting] = React.useState<Task | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const dueRange = DUE_WINDOWS.find((w) => w.value === dueWindow)?.range();

  const query: TaskQuery = {
    status: status === UNSET ? undefined : (status as TaskQuery['status']),
    priority: priority === UNSET ? undefined : (priority as TaskQuery['priority']),
    q: debouncedSearch || undefined,
    // Only meaningful on the "All tasks" tab — the "mine" endpoint forces
    // assigneeId to the caller server-side and would ignore this.
    assigneeId: scope === 'all' && assignee !== UNSET ? assignee : undefined,
    dueBefore: dueRange?.dueBefore,
    dueAfter: dueRange?.dueAfter,
  };
  // A single useQuery call (rather than picking between two resource hooks
  // via `scope`) keeps this unconditional per rules-of-hooks, while the
  // 'mine'/'all' segment of the query key still falls under the ['crm',
  // 'tasks'] prefix every task mutation invalidates.
  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'tasks', scope, query],
    queryFn: () => apiFetch<Task[]>(`/api/crm/tasks${scope === 'mine' ? '/mine' : ''}${buildQuery(query)}`),
  });

  // /tasks/mine forces assigneeId server-side; /tasks/stats has no "mine"
  // variant, so the scope is expressed as an explicit assigneeId here. Held
  // back until the user id is known so the tiles never briefly describe
  // EVERYONE's tasks while sitting on the "My tasks" tab.
  const scopedQuery: TaskQuery = scope === 'mine' ? { ...query, assigneeId: user?.id } : query;
  const statsEnabled = scope === 'all' || Boolean(user?.id);
  const { data: stats, isLoading: statsLoading } = useTaskStats(scopedQuery);
  const { data: countData } = useTasksCount(scopedQuery);

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const bulkAssign = useBulkAssignTasks();
  const bulkDelete = useBulkDeleteTasks();
  const { usersById } = useDirectoryUsers();
  const directoryUsers = React.useMemo(() => [...usersById.values()], [usersById]);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // Drives both the selection column and the bulk toolbar. DataTable calls
  // row.getIsSelected() unconditionally per row and throws if this is left
  // undefined rather than `{}` — see the same note in carriers-list-view.tsx.
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  // Stable reference: `x ?? []` mints a new array on every render while the
  // query has no data (i.e. right after a filter change), which is what drove
  // DataTable's pagination into a render loop. See data-table.tsx.
  const rows = React.useMemo(() => data ?? [], [data]);
  const realTotal = countData?.count ?? rows.length;
  const isTruncated = realTotal > rows.length;
  const hasActiveFilters =
    Boolean(debouncedSearch) || status !== UNSET || priority !== UNSET || assignee !== UNSET || dueWindow !== UNSET;

  function clearFilters() {
    setSearch('');
    setStatus(UNSET);
    setPriority(UNSET);
    setAssignee(UNSET);
    setDueWindow(UNSET);
    setRowSelection({});
  }

  function handleExport() {
    const qs = new URLSearchParams();
    if (query.q) qs.set('q', query.q);
    if (query.status) qs.set('status', query.status);
    if (query.priority) qs.set('priority', query.priority);
    if (query.dueBefore) qs.set('dueBefore', query.dueBefore);
    if (query.dueAfter) qs.set('dueAfter', query.dueAfter);
    if (scope === 'all' && query.assigneeId) qs.set('assigneeId', query.assigneeId);
    // The export endpoint has no "mine" variant either — carry the scope as
    // an explicit assigneeId so the CSV matches the tab you exported from.
    if (scope === 'mine' && user?.id) qs.set('assigneeId', user.id);
    window.location.href = `/api/crm/tasks/export?${qs.toString()}`;
  }

  const columns = React.useMemo<ColumnDef<Task>[]>(
    () => [
      selectionColumn<Task>(),
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
    <div className="space-y-4">
      <TaskStatsStrip stats={statsEnabled ? stats : undefined} isLoading={statsEnabled && statsLoading} />

      <Card>
        <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="w-full space-y-1.5 lg:max-w-xs">
            <label htmlFor={`task-search-${scope}`} className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id={`task-search-${scope}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title or description"
                className="pl-8"
              />
            </div>
          </div>
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
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any priority</SelectItem>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {taskPriorityLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Due</label>
            <Select value={dueWindow} onValueChange={setDueWindow}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any time</SelectItem>
                {DUE_WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Assignee only on "All tasks" — the mine endpoint pins it server-side. */}
          {scope === 'all' ? (
            <div className="w-full space-y-1.5 sm:w-48">
              <label className="text-xs font-medium text-muted-foreground">Assignee</label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Anyone</SelectItem>
                  {directoryUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex items-center gap-2 sm:mb-0.5">
            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
                <X className="h-3.5 w-3.5" aria-hidden /> Clear
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0} className="gap-1.5">
              <Download className="h-3.5 w-3.5" aria-hidden /> Export
            </Button>
          </div>
        </div>

        <BulkActionToolbar
          selectedCount={selectedIds.length}
          onClearSelection={() => setRowSelection({})}
          reassignLabel="Reassign to"
          onReassign={(assigneeId) =>
            bulkAssign.mutate({ ids: selectedIds, assigneeId }, { onSuccess: () => setRowSelection({}) })
          }
          isReassigning={bulkAssign.isPending}
          onDelete={() => bulkDelete.mutate({ ids: selectedIds }, { onSuccess: () => setRowSelection({}) })}
          isDeleting={bulkDelete.isPending}
          entityNamePlural="tasks"
        />

        {isTruncated ? (
          <p className="text-xs text-muted-foreground">
            Showing the first {rows.length.toLocaleString()} of {realTotal.toLocaleString()} matching tasks — narrow the
            filters, or use Export for the full set.
          </p>
        ) : null}

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
    </div>
  );
}

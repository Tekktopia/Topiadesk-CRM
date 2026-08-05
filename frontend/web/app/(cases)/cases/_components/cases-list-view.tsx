'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, MoreHorizontal, Plus } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type RowSelectionState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  selectionColumn,
} from '@topiadesk/ui';
import { useQuickCreateParam } from '@/lib/use-quick-create-param';
import { BulkActionToolbar } from '../../_components/bulk-action-toolbar';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { SlaBadge } from '../../_components/sla-badge';
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TYPES,
  caseTypeLabel,
  casePriorityLabel,
  casePriorityVariant,
  caseStatusLabel,
  caseStatusVariant,
} from '../../_lib/constants';
import { formatDate } from '../../_lib/format';
import {
  useBulkCloseCases,
  useBulkReassignCases,
  useCases,
  useCasesQueue,
  useDirectoryUsers,
  useSelfAssignCase,
  useSlaClocksByPolicyIds,
} from '../../_lib/hooks';
import type { Case, CaseQuery } from '../../_lib/types';
import { CaseFormDialog } from './case-form-dialog';

const UNSET = '__any';

export function CasesListView() {
  const [createOpen, setCreateOpen] = React.useState(false);
  useQuickCreateParam(() => setCreateOpen(true));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cases"
        description="Enquiries, service requests, and complaints."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New case
          </Button>
        }
      />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All cases</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <AllCasesTab />
        </TabsContent>
        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>
      </Tabs>

      <CaseFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function AllCasesTab() {
  const [status, setStatus] = React.useState<string>(UNSET);
  const [priority, setPriority] = React.useState<string>(UNSET);
  const [caseType, setCaseType] = React.useState<string>(UNSET);
  const [assignedToId, setAssignedToId] = React.useState<string>(UNSET);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [editing, setEditing] = React.useState<Case | null>(null);

  const { users, usersById } = useDirectoryUsers();

  const query: CaseQuery = {
    status: status === UNSET ? undefined : (status as CaseQuery['status']),
    priority: priority === UNSET ? undefined : (priority as CaseQuery['priority']),
    caseType: caseType === UNSET ? undefined : (caseType as CaseQuery['caseType']),
    assignedToId: assignedToId === UNSET ? undefined : assignedToId,
  };
  const { data, isLoading, isFetching, isError } = useCases(query);
  const cases = data ?? [];

  const { clocksByEntityId } = useSlaClocksByPolicyIds(cases.map((c) => c.slaPolicyId));
  const bulkReassign = useBulkReassignCases();
  const bulkClose = useBulkCloseCases();
  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  const columns = React.useMemo<ColumnDef<Case>[]>(
    () => [
      selectionColumn<Case>(),
      {
        accessorKey: 'caseNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Case #" />,
        meta: { label: 'Case #' },
        cell: ({ row }) => (
          <Link href={`/cases/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.caseNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'subject',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Subject" />,
        meta: { label: 'Subject' },
        cell: ({ row }) => <span className="block max-w-[220px] truncate text-muted-foreground">{row.original.subject}</span>,
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        accessorFn: (c) => caseTypeLabel(c.caseType),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={caseStatusVariant(row.original.status)}>{caseStatusLabel(row.original.status)}</Badge>,
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Priority" />,
        meta: { label: 'Priority' },
        cell: ({ row }) => <Badge variant={casePriorityVariant(row.original.priority)}>{casePriorityLabel(row.original.priority)}</Badge>,
      },
      {
        id: 'sla',
        header: 'SLA',
        meta: { label: 'SLA' },
        enableSorting: false,
        cell: ({ row }) => <SlaBadge clocks={clocksByEntityId.get(row.original.id)} />,
      },
      {
        id: 'assignedTo',
        header: 'Assigned to',
        meta: { label: 'Assigned to' },
        accessorFn: (c) => (c.assignedToId ? (usersById.get(c.assignedToId)?.fullName ?? c.assignedToId) : 'Unassigned'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        meta: { label: 'Created' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Case actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [clocksByEntityId, usersById],
  );

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All statuses</SelectItem>
                {CASE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {caseStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-40">
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any priority</SelectItem>
                {CASE_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {casePriorityLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={caseType} onValueChange={setCaseType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any type</SelectItem>
                {CASE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {caseTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-56">
            <label className="text-xs font-medium text-muted-foreground">Assigned to</label>
            <Select value={assignedToId} onValueChange={setAssignedToId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Anyone</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedIds.length}
        onClearSelection={() => setRowSelection({})}
        reassignLabel="Reassign owner"
        onReassign={(assignedToId) => bulkReassign.mutate({ ids: selectedIds, assignedToId }, { onSuccess: () => setRowSelection({}) })}
        isReassigning={bulkReassign.isPending}
        secondaryLabel="Close"
        secondaryIcon={CheckCircle2}
        secondaryConfirmTitle={`Close ${selectedIds.length} case${selectedIds.length === 1 ? '' : 's'}?`}
        secondaryConfirmDescription="Marks each selected case CLOSED. A case already CLOSED, or one only reachable from REOPENED, can't transition directly and will be reported as failed rather than skipped silently."
        onSecondaryAction={() => bulkClose.mutate(selectedIds, { onSuccess: () => setRowSelection({}) })}
        isSecondaryPending={bulkClose.isPending}
      />

      {isFetching && !isLoading ? (
        <div className="flex justify-end">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : null}

      {!isLoading && !isError && cases.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState title="No cases match these filters" description="Try clearing a filter, or create a new case." />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Case, unknown>
          columns={columns}
          data={cases}
          getRowId={(c) => c.id}
          isLoading={isLoading}
          isError={isError}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={cases.length}
          enableColumnVisibility
        />
      )}

      <CaseFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} kase={editing ?? undefined} />
    </div>
  );
}

function QueueTab() {
  const { data, isLoading, isFetching, isError } = useCasesQueue();
  const selfAssign = useSelfAssignCase();
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const cases = data ?? [];
  const { clocksByEntityId } = useSlaClocksByPolicyIds(cases.map((c) => c.slaPolicyId));

  const columns = React.useMemo<ColumnDef<Case>[]>(
    () => [
      {
        accessorKey: 'caseNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Case #" />,
        meta: { label: 'Case #' },
        cell: ({ row }) => (
          <Link href={`/cases/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.caseNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'subject',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Subject" />,
        meta: { label: 'Subject' },
        cell: ({ row }) => <span className="block max-w-[220px] truncate text-muted-foreground">{row.original.subject}</span>,
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        accessorFn: (c) => caseTypeLabel(c.caseType),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Priority" />,
        meta: { label: 'Priority' },
        cell: ({ row }) => <Badge variant={casePriorityVariant(row.original.priority)}>{casePriorityLabel(row.original.priority)}</Badge>,
      },
      {
        id: 'sla',
        header: 'SLA',
        meta: { label: 'SLA' },
        enableSorting: false,
        cell: ({ row }) => <SlaBadge clocks={clocksByEntityId.get(row.original.id)} />,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        meta: { label: 'Created' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <Button size="sm" variant="outline" disabled={selfAssign.isPending} onClick={() => selfAssign.mutate(row.original.id)}>
            Claim
          </Button>
        ),
      },
    ],
    [clocksByEntityId, selfAssign],
  );

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Unassigned, still-active cases (NEW/OPEN/REOPENED) ordered by priority — pick one up with &quot;Claim&quot;.
          </p>
        </CardContent>
      </Card>

      {isFetching && !isLoading ? (
        <div className="flex justify-end">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : null}

      {!isLoading && !isError && cases.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState title="Queue is empty" description="Every active case is already assigned." />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Case, unknown>
          columns={columns}
          data={cases}
          getRowId={(c) => c.id}
          isLoading={isLoading}
          isError={isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={cases.length}
        />
      )}
    </div>
  );
}

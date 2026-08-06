'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Filter, Loader2, MoreHorizontal } from 'lucide-react';
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
  selectionColumn,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { BulkActionToolbar } from '../../_components/bulk-action-toolbar';
import { EmptyState } from '../../_components/empty-state';
import { SlaBadge } from '../../_components/sla-badge';
import { caseTypeLabel, casePriorityLabel, casePriorityVariant, caseStatusLabel, caseStatusVariant } from '../../_lib/constants';
import { formatDate } from '../../_lib/format';
import { useBulkCloseCases, useBulkReassignCases, useCases, useCasesCount, useDirectoryUsers, usePolicyLookups, useSlaClocksByPolicyIds } from '../../_lib/hooks';
import type { Case, CaseQuery } from '../../_lib/types';
import { CaseFormDialog } from './case-form-dialog';
import {
  EMPTY_TICKET_FILTERS,
  TicketFiltersPanel,
  countActiveTicketFilters,
  ticketFilterFieldsToQuery,
  type TicketFilterFields,
} from './ticket-filters-panel';
import { TicketCard } from './ticket-card';
import { DEFAULT_TICKET_VIEW_ID, TICKET_VIEWS } from './ticket-views';
import { TicketViewsSidebar } from './ticket-views-sidebar';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Date created', sortBy: 'createdAt' as const, sortDir: 'desc' as const },
  { value: 'priority', label: 'Priority', sortBy: 'priority' as const, sortDir: 'desc' as const },
  { value: 'status', label: 'Status', sortBy: 'status' as const, sortDir: 'asc' as const },
];

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/gu, '""')}"`;
}

function downloadTicketsCsv(cases: Case[], usersById: Map<string, { fullName: string }>, contactsById: Map<string, string>): void {
  if (cases.length === 0) return;
  const columns = ['Ticket #', 'Subject', 'Status', 'Priority', 'Requester', 'Assigned to', 'Created'];
  const rows = cases.map((c) => [
    c.caseNumber,
    c.subject,
    caseStatusLabel(c.status),
    casePriorityLabel(c.priority),
    (c.contactId && contactsById.get(c.contactId)) || '',
    (c.assignedToId && usersById.get(c.assignedToId)?.fullName) || 'Unassigned',
    formatDate(c.createdAt),
  ]);
  const csv = [columns.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tickets-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Freshdesk-style ticket workspace — the "All tickets" tab's body.
 * Composes: TicketViewsSidebar (fixed preset views), a toolbar (sort,
 * layout toggle, export, pager, Filters toggle), the main list (card grid
 * or the pre-existing DataTable), and TicketFiltersPanel (agents/groups/
 * date/resolution-due-by, layered on top of whichever preset view is
 * active).
 */
export function TicketWorkspace() {
  const { user } = useCurrentUser();
  const currentUserId = user?.id ?? '';

  const [activeViewId, setActiveViewId] = React.useState(DEFAULT_TICKET_VIEW_ID);
  const [appliedFilters, setAppliedFilters] = React.useState<TicketFilterFields>(EMPTY_TICKET_FILTERS);
  const [filtersPanelOpen, setFiltersPanelOpen] = React.useState(true);
  const [layout, setLayout] = React.useState<'card' | 'list'>('card');
  const [sortValue, setSortValue] = React.useState<string>(SORT_OPTIONS[0]!.value);
  const [page, setPage] = React.useState(0);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [editing, setEditing] = React.useState<Case | null>(null);

  const activeView = TICKET_VIEWS.find((v) => v.id === activeViewId) ?? TICKET_VIEWS[0]!;
  const sortOption = SORT_OPTIONS.find((o) => o.value === sortValue) ?? SORT_OPTIONS[0]!;

  function selectView(viewId: string) {
    setActiveViewId(viewId);
    setPage(0);
    setRowSelection({});
  }

  function applyFilters(next: TicketFilterFields) {
    setAppliedFilters(next);
    setPage(0);
    setRowSelection({});
  }

  const query: CaseQuery = React.useMemo(() => {
    const viewQuery = currentUserId ? activeView.resolve(currentUserId) : {};
    const panelQuery = ticketFilterFieldsToQuery(appliedFilters);
    return {
      ...viewQuery,
      ...panelQuery,
      sortBy: sortOption.sortBy,
      sortDir: sortOption.sortDir,
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    };
  }, [activeView, appliedFilters, currentUserId, page, sortOption]);

  const { data, isLoading, isFetching, isError } = useCases(query);
  const { data: countData } = useCasesCount(query);
  const cases = data ?? [];
  const total = countData?.total ?? cases.length;

  const { users, usersById } = useDirectoryUsers();
  const { contacts, accounts } = usePolicyLookups();
  const contactsById = React.useMemo(() => new Map(contacts.map((c) => [c.id, c.name])), [contacts]);
  const accountsById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  const { clocksByEntityId } = useSlaClocksByPolicyIds(cases.map((c) => c.slaPolicyId));
  const bulkReassign = useBulkReassignCases();
  const bulkClose = useBulkCloseCases();
  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);
  const hasNextPage = rangeEnd < total;

  const columns = React.useMemo<ColumnDef<Case>[]>(
    () => [
      selectionColumn<Case>(),
      {
        accessorKey: 'caseNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Ticket #" />,
        meta: { label: 'Ticket #' },
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
              <Button variant="ghost" size="icon" aria-label="Ticket actions">
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
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <Select value={sortValue} onValueChange={(v) => { setSortValue(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Layout:</span>
          <Select value={layout} onValueChange={(v) => setLayout(v as 'card' | 'list')}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="list">List</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => downloadTicketsCsv(cases, usersById, contactsById)} disabled={cases.length === 0}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Export
          </Button>

          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          <Button variant={filtersPanelOpen ? 'secondary' : 'outline'} size="sm" onClick={() => setFiltersPanelOpen((v) => !v)}>
            <Filter className="h-3.5 w-3.5" aria-hidden /> Filters
            {countActiveTicketFilters(appliedFilters) > 0 ? <Badge variant="default" className="ml-1 h-4 px-1 text-[10px]">{countActiveTicketFilters(appliedFilters)}</Badge> : null}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-6">
        <TicketViewsSidebar activeViewId={activeViewId} onSelectView={selectView} />

        <div className="min-w-0 flex-1 space-y-4">
          <BulkActionToolbar
            selectedCount={selectedIds.length}
            onClearSelection={() => setRowSelection({})}
            reassignLabel="Reassign owner"
            onReassign={(assignedToId) => bulkReassign.mutate({ ids: selectedIds, assignedToId }, { onSuccess: () => setRowSelection({}) })}
            isReassigning={bulkReassign.isPending}
            secondaryLabel="Close"
            secondaryIcon={CheckCircle2}
            secondaryConfirmTitle={`Close ${selectedIds.length} ticket${selectedIds.length === 1 ? '' : 's'}?`}
            secondaryConfirmDescription="Marks each selected ticket CLOSED. A ticket already CLOSED, or one only reachable from REOPENED, can't transition directly and will be reported as failed rather than skipped silently."
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
                <EmptyState title="No tickets match these filters" description="Try a different view, clear a filter, or create a new ticket." />
              </CardContent>
            </Card>
          ) : layout === 'card' ? (
            <div className="space-y-2">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)
                : cases.map((kase) => (
                    <TicketCard
                      key={kase.id}
                      kase={kase}
                      clocks={clocksByEntityId.get(kase.id)}
                      contactName={kase.contactId ? (contactsById.get(kase.contactId) ?? null) : null}
                      accountName={kase.accountId ? (accountsById.get(kase.accountId) ?? null) : null}
                      users={users}
                      selected={Boolean(rowSelection[kase.id])}
                      onSelectChange={(selected) => setRowSelection((prev) => ({ ...prev, [kase.id]: selected }))}
                    />
                  ))}
            </div>
          ) : (
            <DataTable<Case, unknown>
              columns={columns}
              data={cases}
              getRowId={(c) => c.id}
              isLoading={isLoading}
              isError={isError}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              enableColumnVisibility
            />
          )}
        </div>

        {filtersPanelOpen ? <TicketFiltersPanel currentUserId={currentUserId} applied={appliedFilters} onApply={applyFilters} /> : null}
      </div>

      <CaseFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} kase={editing ?? undefined} />
    </div>
  );
}

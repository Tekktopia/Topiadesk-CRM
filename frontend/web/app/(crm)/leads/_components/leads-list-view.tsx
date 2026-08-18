'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRightLeft, CopyX, Download, LayoutGrid, MoreHorizontal, Plus, Search, Table2, Trash2, X } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  selectionColumn,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { useQuickCreateParam } from '@/lib/use-quick-create-param';
import { BulkActionToolbar } from '../../_components/bulk-action-toolbar';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { SavedViewBar } from '../../_components/saved-view-bar';
import { LEAD_STATUSES, leadStatusLabel, leadStatusVariant } from '../../_lib/constants';
import { formatDate, fullName } from '../../_lib/format';
import {
  useBulkAssignLeads,
  useBulkDeleteLeads,
  useDeleteLead,
  useDirectoryUsers,
  useLeadSources,
  useLeadStats,
  useLeads,
  useLeadsCount,
  useMoveLeadStatus,
} from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { FilterTree, Lead, LeadQuery } from '../../_lib/types';
import { LeadConvertDialog } from './lead-convert-dialog';
import { LeadFormDialog } from './lead-form-dialog';
import { LeadsBoardView } from './leads-board-view';
import { ScoreMeter, leadScoreBandLabel } from '../../_components/score-meter';
import { LeadStatsStrip } from './lead-stats-strip';

const UNSET = '__any';
const FETCH_CAP = 100;

/**
 * Named score bands rather than two free-text number inputs: "hot / warm /
 * cold" is the language the rest of the module already uses, and it keeps
 * the filter to a single control. The thresholds come from
 * _components/score-meter.tsx so the filter and the meter can never disagree about
 * what "hot" means.
 */
const SCORE_BANDS = [
  { value: 'hot', label: 'Hot (70+)', minScore: 70, maxScore: undefined },
  { value: 'warm', label: 'Warm (40-69)', minScore: 40, maxScore: 69 },
  { value: 'cold', label: 'Cold (0-39)', minScore: undefined, maxScore: 39 },
] as const;

export function LeadsListView() {
  const { user } = useCurrentUser();
  const [viewMode, setViewMode] = React.useState<'table' | 'board'>('table');
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<string>(UNSET);
  const [source, setSource] = React.useState<string>(UNSET);
  const [band, setBand] = React.useState<string>(UNSET);
  const [assignedToId, setAssignedToId] = React.useState<string>(UNSET);
  const [mineOnly, setMineOnly] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Lead | null>(null);
  const [deleting, setDeleting] = React.useState<Lead | null>(null);
  const [converting, setConverting] = React.useState<Lead | null>(null);
  // Non-null while a saved view is applied — see accounts-list-view.tsx for the same pattern.
  const [savedViewRows, setSavedViewRows] = React.useState<Lead[] | null>(null);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  useQuickCreateParam(() => setCreateOpen(true));

  const debouncedSearch = useDebouncedValue(search, 300);
  const selectedBand = SCORE_BANDS.find((b) => b.value === band);

  const query: LeadQuery = {
    q: debouncedSearch || undefined,
    status: status === UNSET ? undefined : (status as LeadQuery['status']),
    source: source === UNSET ? undefined : source,
    // "My leads" is the one-click case for the common request; the picker
    // below covers everyone else. Explicit owner selection wins when both
    // are somehow set, since it is the more specific instruction.
    assignedToId: assignedToId !== UNSET ? assignedToId : mineOnly && user ? user.id : undefined,
    minScore: selectedBand?.minScore,
    maxScore: selectedBand?.maxScore,
    take: FETCH_CAP,
  };

  const { data: liveData, isLoading, isError } = useLeads(query);
  const { data: countData } = useLeadsCount(query);
  const { data: stats, isLoading: statsLoading } = useLeadStats(query);
  const { data: leadSourcesData } = useLeadSources();
  const { usersById } = useDirectoryUsers();
  const leadSources = leadSourcesData ?? [];
  // Memoized on the query result itself, NOT on the `?? []` expression
  // above: that fallback allocates a fresh array on every render, so
  // depending on it would rebuild this Map every time, which rebuilds the
  // `columns` memo below, which hands TanStack Table a new columns array
  // each render — the exact unstable-deps render loop documented on
  // useDirectoryUsers() in _lib/hooks.ts.
  const sourceNameByCode = React.useMemo(
    () => new Map((leadSourcesData ?? []).map((s) => [s.code, s.name])),
    [leadSourcesData],
  );
  // Stable reference: `x ?? []` mints a new array on every render while the
  // query has no data (i.e. right after a filter change), which is what drove
  // DataTable's pagination into a render loop. See data-table.tsx.
  const data = React.useMemo(() => savedViewRows ?? liveData ?? [], [savedViewRows, liveData]);
  const realTotal = savedViewRows ? savedViewRows.length : (countData?.count ?? data.length);
  const isTruncated = !savedViewRows && realTotal > data.length;

  const deleteLead = useDeleteLead();
  const bulkAssign = useBulkAssignLeads();
  const bulkDelete = useBulkDeleteLeads();
  const moveStatus = useMoveLeadStatus();

  const hasActiveFilters =
    Boolean(debouncedSearch) || status !== UNSET || source !== UNSET || band !== UNSET || assignedToId !== UNSET || mineOnly;

  function withViewReset<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      setSavedViewRows(null);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
      setter(value);
    };
  }

  function clearFilters() {
    setSavedViewRows(null);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setSearch('');
    setStatus(UNSET);
    setSource(UNSET);
    setBand(UNSET);
    setAssignedToId(UNSET);
    setMineOnly(false);
  }

  // Current filter controls -> saved-view-filters.ts's LEAD allowlist shape.
  function buildFilters(): FilterTree {
    const conditions: FilterTree['conditions'] = [];
    if (status !== UNSET) conditions.push({ field: 'status', operator: 'eq', value: status });
    if (source !== UNSET) conditions.push({ field: 'source', operator: 'eq', value: source });
    if (assignedToId !== UNSET) conditions.push({ field: 'assignedToId', operator: 'eq', value: assignedToId });
    else if (mineOnly && user) conditions.push({ field: 'assignedToId', operator: 'eq', value: user.id });
    return { op: 'AND', conditions };
  }

  function handleExport() {
    const qs = new URLSearchParams();
    if (query.q) qs.set('q', query.q);
    if (query.status) qs.set('status', query.status);
    if (query.source) qs.set('source', query.source);
    if (query.assignedToId) qs.set('assignedToId', query.assignedToId);
    if (query.minScore !== undefined) qs.set('minScore', String(query.minScore));
    if (query.maxScore !== undefined) qs.set('maxScore', String(query.maxScore));
    window.location.href = `/api/crm/leads/export?${qs.toString()}`;
  }

  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  const columns = React.useMemo<ColumnDef<Lead>[]>(
    () => [
      selectionColumn<Lead>(),
      {
        id: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        accessorFn: (l) => fullName(l.firstName, l.lastName),
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/leads/${row.original.id}`} className="font-medium text-foreground hover:underline">
              {fullName(row.original.firstName, row.original.lastName)}
            </Link>
            {row.original.email ? <p className="truncate text-xs text-muted-foreground">{row.original.email}</p> : null}
          </div>
        ),
      },
      {
        id: 'company',
        header: 'Company',
        meta: { label: 'Company' },
        accessorFn: (l) => l.companyName ?? '—',
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'source',
        header: 'Source',
        meta: { label: 'Source' },
        accessorFn: (l) => sourceNameByCode.get(l.source) ?? l.source,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner' },
        accessorFn: (l) => (l.assignedToId ? (usersById.get(l.assignedToId)?.fullName ?? 'Unknown') : 'Unassigned'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'score',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Score" />,
        meta: { label: 'Score' },
        cell: ({ row }) => <ScoreMeter score={row.original.score} ariaLabel={`Score ${row.original.score} of 100 — ${leadScoreBandLabel(row.original.score)}`} />,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={leadStatusVariant(row.original.status)}>{leadStatusLabel(row.original.status)}</Badge>,
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
              <Button variant="ghost" size="icon" aria-label="Lead actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.original.status !== 'CONVERTED' ? (
                <DropdownMenuItem onSelect={() => setConverting(row.original)}>
                  <ArrowRightLeft aria-hidden /> Convert
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [sourceNameByCode, usersById],
  );

  const directoryUsers = React.useMemo(() => [...usersById.values()], [usersById]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Inbound prospects, scored and ready to qualify."
        actions={
          <>
            <Button variant="outline" onClick={handleExport} disabled={realTotal === 0}>
              <Download aria-hidden /> Export
            </Button>
            <Button variant="outline" asChild>
              <Link href="/duplicates?entity=LEAD">
                <CopyX aria-hidden /> Find duplicates
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New lead
            </Button>
          </>
        }
      />

      <LeadStatsStrip stats={stats} isLoading={statsLoading} />

      <SavedViewBar<Lead> entityType="LEAD" buildFilters={buildFilters} onApply={setSavedViewRows} />

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="w-full space-y-1.5 lg:max-w-xs">
              <label htmlFor="lead-search" className="text-xs font-medium text-muted-foreground">
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="lead-search"
                  value={search}
                  onChange={(e) => withViewReset(setSearch)(e.target.value)}
                  placeholder="Name, email, company, phone"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="w-full space-y-1.5 sm:w-44">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={status} onValueChange={withViewReset(setStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>All statuses</SelectItem>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {leadStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full space-y-1.5 sm:w-44">
              <label className="text-xs font-medium text-muted-foreground">Source</label>
              <Select value={source} onValueChange={withViewReset(setSource)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>All sources</SelectItem>
                  {leadSources.map((s) => (
                    <SelectItem key={s.id} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full space-y-1.5 sm:w-40">
              <label className="text-xs font-medium text-muted-foreground">Score</label>
              <Select value={band} onValueChange={withViewReset(setBand)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Any score</SelectItem>
                  {SCORE_BANDS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full space-y-1.5 sm:w-48">
              <label className="text-xs font-medium text-muted-foreground">Owner</label>
              <Select value={assignedToId} onValueChange={withViewReset(setAssignedToId)}>
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={mineOnly}
                onChange={(e) => withViewReset(setMineOnly)(e.target.checked)}
                disabled={!user || assignedToId !== UNSET}
              />
              My leads only
            </label>
            <div className="flex items-center gap-2">
              {hasActiveFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
                  <X className="h-3.5 w-3.5" aria-hidden /> Clear filters
                </Button>
              ) : null}
              <div className="flex rounded-md border border-input p-0.5">
                <Button
                  type="button"
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 gap-1.5 px-2.5"
                  onClick={() => setViewMode('table')}
                  aria-pressed={viewMode === 'table'}
                >
                  <Table2 className="h-3.5 w-3.5" aria-hidden /> Table
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'board' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 gap-1.5 px-2.5"
                  onClick={() => setViewMode('board')}
                  aria-pressed={viewMode === 'board'}
                >
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Board
                </Button>
              </div>
            </div>
          </div>

          {isTruncated ? (
            <p className="text-xs text-muted-foreground">
              Showing the first {data.length.toLocaleString()} of {realTotal.toLocaleString()} matching leads — narrow the
              filters, or use Export for the full set.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedIds.length}
        onClearSelection={() => setRowSelection({})}
        reassignLabel="Reassign to"
        onReassign={(nextAssignee) =>
          bulkAssign.mutate({ ids: selectedIds, assignedToId: nextAssignee }, { onSuccess: () => setRowSelection({}) })
        }
        isReassigning={bulkAssign.isPending}
        onDelete={() => bulkDelete.mutate({ ids: selectedIds }, { onSuccess: () => setRowSelection({}) })}
        isDeleting={bulkDelete.isPending}
        entityNamePlural="leads"
      />

      {!isLoading && !isError && data.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title={hasActiveFilters ? 'No leads match these filters' : 'No leads yet'}
              description={hasActiveFilters ? 'Try widening the search or clearing a filter.' : undefined}
              action={
                hasActiveFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    <X aria-hidden /> Clear filters
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus aria-hidden /> New lead
                  </Button>
                )
              }
            />
          </CardContent>
        </Card>
      ) : viewMode === 'board' ? (
        <LeadsBoardView
          leads={data}
          isLoading={isLoading}
          movingId={moveStatus.isPending ? (moveStatus.variables?.id ?? null) : null}
          onMoveStatus={(lead, nextStatus) => moveStatus.mutate({ id: lead.id, status: nextStatus })}
          onConvert={(lead) => setConverting(lead)}
        />
      ) : (
        <DataTable<Lead, unknown>
          columns={columns}
          data={data}
          getRowId={(l) => l.id}
          isLoading={isLoading}
          isError={isError}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={data.length}
          enableColumnVisibility
        />
      )}

      <LeadFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? <LeadFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} lead={editing} /> : null}
      {converting ? (
        <LeadConvertDialog open={Boolean(converting)} onOpenChange={(open) => !open && setConverting(null)} lead={converting} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete lead "${deleting ? fullName(deleting.firstName, deleting.lastName) : ''}"?`}
        description="This permanently removes the lead. This cannot be undone."
        confirmLabel="Delete lead"
        destructive
        isPending={deleteLead.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteLead.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

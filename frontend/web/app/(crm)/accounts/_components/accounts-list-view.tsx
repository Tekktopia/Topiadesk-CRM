'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArchiveRestore, CopyX, Download, MoreHorizontal, Plus, Trash2, Upload } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
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
import { EmptyState } from '../../_components/empty-state';
import { IndustryCombobox } from '../../_components/industry-combobox';
import { PageHeader } from '../../_components/page-header';
import { SavedViewBar } from '../../_components/saved-view-bar';
import {
  ACCOUNT_STATUSES,
  RISK_RATINGS,
  accountStatusLabel,
  accountStatusVariant,
  accountTypeLabel,
  healthScoreLabel,
  healthScoreVariant,
  riskRatingLabel,
  riskRatingVariant,
} from '../../_lib/constants';
import { formatDate, initials } from '../../_lib/format';
import { useCan } from '@/app/(cases)/_lib/hooks';
import {
  useAccountStats,
  useAccounts,
  useAccountsCount,
  useBulkAssignAccounts,
  useBulkDeleteAccounts,
  useDeleteAccount,
  useDirectoryUsers,
  useImportAccountsCsv,
  useRestoreAccount,
} from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { Account, AccountQuery, FilterTree } from '../../_lib/types';
import { AccountFormDialog } from './account-form-dialog';
import { AccountStatsStrip } from './account-stats-strip';
import { ConfirmDialog } from '../../_components/confirm-dialog';

const UNSET = '__any';

export function AccountsListView() {
  const { user } = useCurrentUser();
  const canWrite = useCan('account', 'write');
  const searchParams = useSearchParams();
  // Dashboard drill-down entry point (e.g. the "Active clients" KPI tile
  // linking to /accounts?status=CLIENT) — read once as the initial value,
  // same as opportunities-kanban-view.tsx's accountIdFilter pattern, not a
  // live-synced param: once here, status becomes a normal local filter the
  // Select below can freely change.
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<string>(() => searchParams.get('status') ?? UNSET);
  const [riskRating, setRiskRating] = React.useState<string>(UNSET);
  const [industry, setIndustry] = React.useState<{ id: string; name: string } | null>(null);
  const [tag, setTag] = React.useState('');
  const [mineOnly, setMineOnly] = React.useState(false);
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Account | null>(null);
  const [deleting, setDeleting] = React.useState<Account | null>(null);
  // Non-null while a saved view is applied — its server-run rows replace the
  // live filtered query until the view is cleared or a manual filter changes.
  const [savedViewRows, setSavedViewRows] = React.useState<Account[] | null>(null);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const importInputRef = React.useRef<HTMLInputElement>(null);
  useQuickCreateParam(() => setCreateOpen(true));

  const debouncedSearch = useDebouncedValue(search, 300);
  const debouncedTag = useDebouncedValue(tag, 300);

  const FETCH_CAP = 100;
  const query: AccountQuery = {
    q: debouncedSearch || undefined,
    status: status === UNSET ? undefined : (status as AccountQuery['status']),
    riskRating: riskRating === UNSET ? undefined : (riskRating as AccountQuery['riskRating']),
    industryId: industry?.id,
    tag: debouncedTag || undefined,
    ownerId: mineOnly && user ? user.id : undefined,
    // Sent as the literal string 'true', or omitted entirely — never as a
    // boolean `false`. The API models this flag as a string on purpose: the
    // global ValidationPipe's enableImplicitConversion casts a
    // boolean-typed query param with Boolean(), so the string "false"
    // arrived as `true` and archived accounts were shown even with the box
    // unchecked (see AccountQueryDto.includeArchived).
    includeArchived: includeArchived ? 'true' : undefined,
    take: FETCH_CAP,
  };

  const { data: liveData, isLoading, isError } = useAccounts(query);
  const { data: countData } = useAccountsCount(query);
  const { data: stats, isLoading: statsLoading } = useAccountStats(query);
  // Stable reference: `x ?? []` mints a new array on every render while the
  // query has no data (i.e. right after a filter change), which is what drove
  // DataTable's pagination into a render loop. See data-table.tsx.
  const data = React.useMemo(() => savedViewRows ?? liveData ?? [], [savedViewRows, liveData]);
  const realTotal = savedViewRows ? savedViewRows.length : (countData?.count ?? data.length);
  const isTruncated = !savedViewRows && realTotal > data.length;
  const { usersById } = useDirectoryUsers();
  const deleteAccount = useDeleteAccount();
  const restoreAccount = useRestoreAccount();
  const bulkAssign = useBulkAssignAccounts();
  const bulkDelete = useBulkDeleteAccounts();
  const importCsv = useImportAccountsCsv();

  /** Manual filter edits always drop back to the live query — a stale saved-view result would silently ignore them. */
  function withViewReset<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      setSavedViewRows(null);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
      setter(value);
    };
  }

  // Translates the current filter controls into the FilterTree shape
  // saved-view-filters.ts accepts for ACCOUNT (status/riskRating/industryId/
  // ownerId eq; name contains).
  function buildFilters(): FilterTree {
    const conditions: FilterTree['conditions'] = [];
    if (debouncedSearch) conditions.push({ field: 'name', operator: 'contains', value: debouncedSearch });
    if (status !== UNSET) conditions.push({ field: 'status', operator: 'eq', value: status });
    if (riskRating !== UNSET) conditions.push({ field: 'riskRating', operator: 'eq', value: riskRating });
    if (industry) conditions.push({ field: 'industryId', operator: 'eq', value: industry.id });
    if (mineOnly && user) conditions.push({ field: 'ownerId', operator: 'eq', value: user.id });
    return { op: 'AND', conditions };
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    importCsv.mutate(file);
  }

  function handleExport() {
    const qs = new URLSearchParams();
    if (query.q) qs.set('q', query.q);
    if (query.status) qs.set('status', query.status);
    if (query.riskRating) qs.set('riskRating', query.riskRating);
    if (query.industryId) qs.set('industryId', query.industryId);
    if (query.tag) qs.set('tag', query.tag);
    if (query.ownerId) qs.set('ownerId', query.ownerId);
    if (query.includeArchived) qs.set('includeArchived', 'true');
    window.location.href = `/api/crm/accounts/export?${qs.toString()}`;
  }

  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  const columns = React.useMemo<ColumnDef<Account>[]>(
    () => [
      selectionColumn<Account>(),
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => (
          <Link href={`/accounts/${row.original.id}`} className="flex items-center gap-2 font-medium text-foreground hover:underline">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px]">{initials(row.original.name)}</AvatarFallback>
            </Avatar>
            {row.original.name}
            {row.original.isArchived ? (
              <Badge variant="outline" className="font-normal">
                Archived
              </Badge>
            ) : null}
          </Link>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        accessorFn: (a) => accountTypeLabel(a.accountType),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <Badge variant={accountStatusVariant(row.original.status)}>{accountStatusLabel(row.original.status)}</Badge>
        ),
      },
      {
        accessorKey: 'riskRating',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Risk" />,
        meta: { label: 'Risk' },
        cell: ({ row }) => (
          <Badge variant={riskRatingVariant(row.original.riskRating)}>{riskRatingLabel(row.original.riskRating)}</Badge>
        ),
      },
      {
        accessorKey: 'healthScore',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Health" />,
        meta: { label: 'Health' },
        cell: ({ row }) => (
          <Badge variant={healthScoreVariant(row.original.healthScore)}>{healthScoreLabel(row.original.healthScore)}</Badge>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner' },
        accessorFn: (a) => usersById.get(a.ownerId)?.fullName ?? a.ownerId,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'tags',
        header: 'Tags',
        meta: { label: 'Tags' },
        accessorFn: (a) => a.tags.join(', '),
        cell: ({ row }) =>
          row.original.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.original.tags.map((t) => (
                <Badge key={t} variant="outline" className="font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'location',
        header: 'Location',
        meta: { label: 'Location' },
        accessorFn: (a) => [a.city, a.country].filter(Boolean).join(', ') || '—',
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
              <Button variant="ghost" size="icon" aria-label="Account actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              {row.original.isArchived ? (
                <DropdownMenuItem onSelect={() => restoreAccount.mutate(row.original.id)}>
                  <ArchiveRestore aria-hidden /> Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                  <Trash2 aria-hidden /> Archive
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // restoreAccount.mutate specifically, not the whole useMutation() result
    // object — that object is reconstructed every render even though
    // .mutate itself is a stable reference, so depending on the object
    // would defeat this memo the same way the unmemoized usersById Map did
    // (see that hook's fix in _lib/hooks.ts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usersById, restoreAccount.mutate],
  );

  return (
    <div className="space-y-6">
      <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
      <PageHeader
        title="Accounts"
        description="Client and prospect organizations your team manages."
        actions={
          <>
            <Button variant="outline" onClick={handleExport}>
              <Download aria-hidden /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={importCsv.isPending}>
              <Upload aria-hidden /> {importCsv.isPending ? 'Importing…' : 'Import CSV'}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/duplicates?entity=ACCOUNT">
                <CopyX aria-hidden /> Find duplicates
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)} disabled={!canWrite} title={!canWrite ? 'You do not have permission to create accounts' : undefined}>
              <Plus aria-hidden /> New account
            </Button>
          </>
        }
      />

      <AccountStatsStrip stats={stats} isLoading={statsLoading} />

      <SavedViewBar<Account> entityType="ACCOUNT" buildFilters={buildFilters} onApply={setSavedViewRows} />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="account-search">
              Search
            </label>
            <Input
              id="account-search"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => withViewReset(setSearch)(e.target.value)}
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={withViewReset(setStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All statuses</SelectItem>
                {ACCOUNT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {accountStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Risk rating</label>
            <Select value={riskRating} onValueChange={withViewReset(setRiskRating)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any risk</SelectItem>
                {RISK_RATINGS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {riskRatingLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Industry</label>
            <IndustryCombobox value={industry} onChange={withViewReset(setIndustry)} placeholder="Any industry" />
          </div>
          <div className="w-full space-y-1.5 sm:w-40">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="account-tag">
              Tag
            </label>
            <Input id="account-tag" placeholder="e.g. high-value" value={tag} onChange={(e) => withViewReset(setTag)(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={mineOnly}
              onChange={(e) => withViewReset(setMineOnly)(e.target.checked)}
              disabled={!user}
            />
            My accounts only
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={includeArchived}
              onChange={(e) => withViewReset(setIncludeArchived)(e.target.checked)}
            />
            Include archived
          </label>
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedIds.length}
        onClearSelection={() => setRowSelection({})}
        reassignLabel="Reassign owner"
        onReassign={(ownerId) => bulkAssign.mutate({ ids: selectedIds, ownerId }, { onSuccess: () => setRowSelection({}) })}
        isReassigning={bulkAssign.isPending}
        onDelete={() => bulkDelete.mutate({ ids: selectedIds }, { onSuccess: () => setRowSelection({}) })}
        isDeleting={bulkDelete.isPending}
        entityNamePlural="accounts"
      />

      {!isLoading && !isError && data.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No accounts match these filters"
              description="Try clearing a filter, or create a new account to get started."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)} disabled={!canWrite} title={!canWrite ? 'You do not have permission to create accounts' : undefined}>
                  <Plus aria-hidden /> New account
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {isTruncated ? (
            <p className="text-xs text-muted-foreground">
              Showing the first {data.length} of {realTotal} matching accounts — narrow your filters to see the rest.
            </p>
          ) : null}
          <DataTable<Account, unknown>
            columns={columns}
            data={data}
            getRowId={(a) => a.id}
            isLoading={isLoading}
            isError={isError}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            pagination={pagination}
            onPaginationChange={setPagination}
            totalRowCount={realTotal}
            enableColumnVisibility
          />
        </>
      )}

      <AccountFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? (
        <AccountFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} account={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Archive "${deleting?.name}"?`}
        description="Archived accounts are hidden from the default list but can be restored at any time — nothing is permanently deleted."
        confirmLabel="Archive account"
        destructive
        isPending={deleteAccount.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteAccount.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { CopyX, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { SavedViewBar } from '../../_components/saved-view-bar';
import { ACCOUNT_STATUSES, RISK_RATINGS, accountStatusLabel, accountStatusVariant, riskRatingLabel, riskRatingVariant } from '../../_lib/constants';
import { formatDate } from '../../_lib/format';
import { useAccounts, useBulkAssignAccounts, useBulkDeleteAccounts, useDeleteAccount } from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { Account, AccountQuery, FilterTree } from '../../_lib/types';
import { AccountFormDialog } from './account-form-dialog';
import { ConfirmDialog } from '../../_components/confirm-dialog';

const UNSET = '__any';

export function AccountsListView() {
  const { user } = useCurrentUser();
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<string>(UNSET);
  const [riskRating, setRiskRating] = React.useState<string>(UNSET);
  const [industryId, setIndustryId] = React.useState('');
  const [mineOnly, setMineOnly] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Account | null>(null);
  const [deleting, setDeleting] = React.useState<Account | null>(null);
  // Non-null while a saved view is applied — its server-run rows replace the
  // live filtered query until the view is cleared or a manual filter changes.
  const [savedViewRows, setSavedViewRows] = React.useState<Account[] | null>(null);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  useQuickCreateParam(() => setCreateOpen(true));

  const debouncedSearch = useDebouncedValue(search, 300);

  const query: AccountQuery = {
    q: debouncedSearch || undefined,
    status: status === UNSET ? undefined : (status as AccountQuery['status']),
    riskRating: riskRating === UNSET ? undefined : (riskRating as AccountQuery['riskRating']),
    industryId: industryId || undefined,
    ownerId: mineOnly && user ? user.id : undefined,
    take: 100,
  };

  const { data: liveData, isLoading, isError } = useAccounts(query);
  const data = savedViewRows ?? liveData ?? [];
  const deleteAccount = useDeleteAccount();
  const bulkAssign = useBulkAssignAccounts();
  const bulkDelete = useBulkDeleteAccounts();

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
    if (industryId) conditions.push({ field: 'industryId', operator: 'eq', value: industryId });
    if (mineOnly && user) conditions.push({ field: 'ownerId', operator: 'eq', value: user.id });
    return { op: 'AND', conditions };
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
          <Link href={`/accounts/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        accessorFn: (a) => (a.accountType === 'CORPORATE' ? 'Corporate' : 'Individual'),
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
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Client and prospect organizations your team manages."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/duplicates?entity=ACCOUNT">
                <CopyX aria-hidden /> Find duplicates
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New account
            </Button>
          </>
        }
      />

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
            <label className="text-xs font-medium text-muted-foreground" htmlFor="account-industry">
              Industry ID
            </label>
            <Input
              id="account-industry"
              placeholder="Optional UUID"
              value={industryId}
              onChange={(e) => withViewReset(setIndustryId)(e.target.value)}
            />
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
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New account
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
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
          totalRowCount={data.length}
          enableColumnVisibility
        />
      )}

      <AccountFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? (
        <AccountFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} account={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the account. This cannot be undone."
        confirmLabel="Delete account"
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

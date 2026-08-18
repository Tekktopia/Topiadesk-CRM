'use client';

import * as React from 'react';
import { BarChart3, Download, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
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
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { SalesQuotaStatsStrip } from '../../_components/sales-quota-stats-strip';
import { humanize } from '../../_lib/constants';
import { formatCurrency, formatDate } from '../../_lib/format';
import {
  useBranches,
  useDeleteSalesQuota,
  useDepartments,
  useDirectoryUsers,
  useSalesQuotas,
  useSalesQuotaStats,
} from '../../_lib/hooks';
import type { QuotaPeriodType, QuotaScopeType, SalesQuota } from '../../_lib/types';

const UNSET = '__any';
const SCOPE_TYPES: QuotaScopeType[] = ['USER', 'DEPARTMENT', 'BRANCH', 'ORG'];
const PERIOD_TYPES: QuotaPeriodType[] = ['MONTH', 'QUARTER', 'YEAR'];
import { SalesQuotaAttainmentDialog } from './sales-quota-attainment-dialog';
import { SalesQuotaFormDialog } from './sales-quota-form-dialog';

function targetLabel(
  quota: SalesQuota,
  usersById: Map<string, { fullName: string }>,
  departmentsById: Map<string, { name: string }>,
  branchesById: Map<string, { name: string }>,
): string {
  switch (quota.scopeType) {
    case 'USER':
      return quota.userId ? (usersById.get(quota.userId)?.fullName ?? `User ${quota.userId.slice(0, 8)}…`) : '—';
    case 'DEPARTMENT':
      return quota.departmentId ? (departmentsById.get(quota.departmentId)?.name ?? `Department ${quota.departmentId.slice(0, 8)}…`) : '—';
    case 'BRANCH':
      return quota.branchId ? (branchesById.get(quota.branchId)?.name ?? `Branch ${quota.branchId.slice(0, 8)}…`) : '—';
    case 'ORG':
      return 'Whole org';
  }
}

export function SalesQuotasView() {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SalesQuota | null>(null);
  const [viewingAttainmentId, setViewingAttainmentId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<SalesQuota | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // No bulk actions here (no selection column below), but DataTable's
  // row.getIsSelected() is called unconditionally per row and throws if
  // `rowSelection` state is left undefined instead of `{}` — see the same
  // note in carriers-list-view.tsx.
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [scopeType, setScopeType] = React.useState<string>(UNSET);
  const [periodType, setPeriodType] = React.useState<string>(UNSET);
  const [currentOnly, setCurrentOnly] = React.useState(false);

  const query = React.useMemo(
    () => ({
      scopeType: scopeType === UNSET ? undefined : (scopeType as QuotaScopeType),
      periodType: periodType === UNSET ? undefined : (periodType as QuotaPeriodType),
      // Omitted entirely rather than sent as 'false' — the API treats the
      // param's presence as the filter, so 'false' would still be truthy
      // as a query string.
      currentOnly: currentOnly ? 'true' : undefined,
    }),
    [scopeType, periodType, currentOnly],
  );

  const { data, isLoading, isError } = useSalesQuotas(query);
  const { data: stats, isLoading: statsLoading } = useSalesQuotaStats(query);
  const { usersById } = useDirectoryUsers();
  const { data: departments } = useDepartments();
  const { data: branches } = useBranches();
  const deleteMutation = useDeleteSalesQuota();
  const departmentsById = React.useMemo(() => new Map((departments ?? []).map((d) => [d.id, d])), [departments]);
  const branchesById = React.useMemo(() => new Map((branches ?? []).map((b) => [b.id, b])), [branches]);

  // Stable reference: `x ?? []` mints a new array on every render while the
  // query has no data (i.e. right after a filter change), which is what drove
  // DataTable's pagination into a render loop. See data-table.tsx.
  const rows = React.useMemo(() => data ?? [], [data]);
  const hasActiveFilters = scopeType !== UNSET || periodType !== UNSET || currentOnly;

  function handleExport() {
    const qs = new URLSearchParams();
    if (query.scopeType) qs.set('scopeType', query.scopeType);
    if (query.periodType) qs.set('periodType', query.periodType);
    if (query.currentOnly) qs.set('currentOnly', query.currentOnly);
    window.location.href = `/api/crm/sales-quotas/export?${qs.toString()}`;
  }

  const columns = React.useMemo<ColumnDef<SalesQuota>[]>(
    () => [
      {
        accessorKey: 'scopeType',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Scope" />,
        meta: { label: 'Scope' },
        cell: ({ row }) => <Badge variant="secondary">{humanize(row.original.scopeType)}</Badge>,
      },
      {
        id: 'target',
        header: 'Target',
        meta: { label: 'Target' },
        enableSorting: false,
        accessorFn: (q) => targetLabel(q, usersById, departmentsById, branchesById),
        cell: ({ getValue }) => <span className="text-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'period',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Period" />,
        meta: { label: 'Period' },
        accessorFn: (q) => q.periodStart,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {humanize(row.original.periodType)} · {formatDate(row.original.periodStart)} – {formatDate(row.original.periodEnd)}
          </span>
        ),
        sortingFn: (a, b) => new Date(a.original.periodStart).getTime() - new Date(b.original.periodStart).getTime(),
      },
      {
        accessorKey: 'targetAmount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Amount" />,
        meta: { label: 'Amount' },
        cell: ({ row }) => <span className="font-medium text-foreground">{formatCurrency(row.original.targetAmount)}</span>,
      },
      {
        id: 'lineOfBusiness',
        header: 'Line of business',
        meta: { label: 'Line of business' },
        enableSorting: false,
        accessorFn: (q) => q.lineOfBusiness ?? 'All',
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Sales quota actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setViewingAttainmentId(row.original.id)}>
                <BarChart3 aria-hidden /> View attainment
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setPendingDelete(row.original)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [usersById, departmentsById, branchesById],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Quotas"
        description="Target revenue for a user, department, branch, or the whole org over a period."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
              <Download aria-hidden /> Export
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New quota
            </Button>
          </div>
        }
      />

      <SalesQuotaStatsStrip stats={stats} isLoading={statsLoading} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Select value={scopeType} onValueChange={setScopeType}>
            <SelectTrigger className="w-44" aria-label="Filter by scope">
              <SelectValue placeholder="All scopes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>All scopes</SelectItem>
              {SCOPE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {humanize(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodType} onValueChange={setPeriodType}>
            <SelectTrigger className="w-44" aria-label="Filter by period">
              <SelectValue placeholder="All periods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>All periods</SelectItem>
              {PERIOD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {humanize(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={currentOnly ? 'default' : 'outline'}
            size="sm"
            aria-pressed={currentOnly}
            onClick={() => setCurrentOnly((v) => !v)}
          >
            In force today
          </Button>
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setScopeType(UNSET);
                setPeriodType(UNSET);
                setCurrentOnly(false);
              }}
            >
              <X aria-hidden /> Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title={hasActiveFilters ? 'No quotas match these filters' : 'No sales quotas yet'}
              description={
                hasActiveFilters
                  ? 'Try a different scope or period, or clear the filters.'
                  : 'Set a target for a rep, department, branch, or the org to track attainment against.'
              }
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New quota
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<SalesQuota, unknown>
          columns={columns}
          data={rows}
          getRowId={(q) => q.id}
          isLoading={isLoading}
          isError={isError}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={rows.length}
          enableColumnVisibility
        />
      )}

      <SalesQuotaFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? <SalesQuotaFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} quota={editing} /> : null}
      <SalesQuotaAttainmentDialog
        open={Boolean(viewingAttainmentId)}
        onOpenChange={(open) => !open && setViewingAttainmentId(null)}
        quotaId={viewingAttainmentId ?? undefined}
      />

      {pendingDelete ? (
        <ConfirmDialog
          open={!!pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title="Delete this sales quota?"
          description="This permanently removes the quota and its target. This can't be undone."
          confirmLabel="Delete"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })}
        />
      ) : null}
    </div>
  );
}

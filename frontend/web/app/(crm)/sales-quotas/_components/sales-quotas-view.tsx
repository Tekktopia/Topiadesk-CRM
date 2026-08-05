'use client';

import * as React from 'react';
import { BarChart3, MoreHorizontal, Plus } from 'lucide-react';
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
} from '@topiadesk/ui';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { humanize } from '../../_lib/constants';
import { formatCurrency, formatDate } from '../../_lib/format';
import { useDirectoryUsers, useSalesQuotas } from '../../_lib/hooks';
import type { SalesQuota } from '../../_lib/types';
import { SalesQuotaAttainmentDialog } from './sales-quota-attainment-dialog';
import { SalesQuotaFormDialog } from './sales-quota-form-dialog';

function targetLabel(quota: SalesQuota, usersById: Map<string, { fullName: string }>): string {
  switch (quota.scopeType) {
    case 'USER':
      return quota.userId ? (usersById.get(quota.userId)?.fullName ?? `User ${quota.userId.slice(0, 8)}…`) : '—';
    case 'DEPARTMENT':
      return quota.departmentId ? `Department ${quota.departmentId.slice(0, 8)}…` : '—';
    case 'BRANCH':
      return quota.branchId ? `Branch ${quota.branchId.slice(0, 8)}…` : '—';
    case 'ORG':
      return 'Whole org';
  }
}

export function SalesQuotasView() {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SalesQuota | null>(null);
  const [viewingAttainmentId, setViewingAttainmentId] = React.useState<string | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // No bulk actions here (no selection column below), but DataTable's
  // row.getIsSelected() is called unconditionally per row and throws if
  // `rowSelection` state is left undefined instead of `{}` — see the same
  // note in carriers-list-view.tsx.
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const { data, isLoading, isError } = useSalesQuotas();
  const { usersById } = useDirectoryUsers();

  const rows = data ?? [];

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
        accessorFn: (q) => targetLabel(q, usersById),
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
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [usersById],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Quotas"
        description="Target revenue for a user, department, branch, or the whole org over a period."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New quota
          </Button>
        }
      />

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No sales quotas yet"
              description="Set a target for a rep, department, branch, or the org to track attainment against."
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
    </div>
  );
}

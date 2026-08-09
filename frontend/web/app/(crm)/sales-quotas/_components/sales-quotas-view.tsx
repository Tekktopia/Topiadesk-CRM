'use client';

import * as React from 'react';
import { BarChart3, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { humanize } from '../../_lib/constants';
import { formatCurrency, formatDate } from '../../_lib/format';
import { useBranches, useDeleteSalesQuota, useDepartments, useDirectoryUsers, useSalesQuotas } from '../../_lib/hooks';
import type { SalesQuota } from '../../_lib/types';
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

  const { data, isLoading, isError } = useSalesQuotas();
  const { usersById } = useDirectoryUsers();
  const { data: departments } = useDepartments();
  const { data: branches } = useBranches();
  const deleteMutation = useDeleteSalesQuota();
  const departmentsById = React.useMemo(() => new Map((departments ?? []).map((d) => [d.id, d])), [departments]);
  const branchesById = React.useMemo(() => new Map((branches ?? []).map((b) => [b.id, b])), [branches]);

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

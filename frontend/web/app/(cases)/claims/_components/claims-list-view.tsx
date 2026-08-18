'use client';

import * as React from 'react';
import Link from 'next/link';
import { Ban, Loader2, MoreHorizontal, Plus } from 'lucide-react';
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
  selectionColumn,
} from '@topiadesk/ui';
import { BulkActionToolbar } from '../../_components/bulk-action-toolbar';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { SlaBadge } from '../../_components/sla-badge';
import { CASE_PRIORITIES, CLAIM_STATUSES, casePriorityLabel, casePriorityVariant, claimStatusLabel, claimStatusVariant } from '../../_lib/constants';
import { formatDate } from '../../_lib/format';
import { useBulkReassignClaims, useBulkWithdrawClaims, useClaimStats, useClaims, useDirectoryUsers, usePolicyLookups, useSlaClocksByPolicyIds } from '../../_lib/hooks';
import { ClaimStatsStrip } from '../../_components/claim-stats-strip';
import type { Claim, ClaimQuery } from '../../_lib/types';
import { ClaimFormDialog } from './claim-form-dialog';

const UNSET = '__any';

export function ClaimsListView() {
  const [status, setStatus] = React.useState<string>(UNSET);
  const [priority, setPriority] = React.useState<string>(UNSET);
  const [adjusterId, setAdjusterId] = React.useState<string>(UNSET);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Claim | null>(null);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const { usersById, users } = useDirectoryUsers();
  const { policies } = usePolicyLookups();
  const policyById = React.useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies]);

  const query: ClaimQuery = {
    status: status === UNSET ? undefined : (status as ClaimQuery['status']),
    priority: priority === UNSET ? undefined : (priority as ClaimQuery['priority']),
    adjusterId: adjusterId === UNSET ? undefined : adjusterId,
  };

  const { data, isLoading, isFetching, isError } = useClaims(query);
  const { data: claimStats, isLoading: claimStatsLoading } = useClaimStats(query);
  const claims = data ?? [];

  const { clocksByEntityId } = useSlaClocksByPolicyIds(claims.map((c) => c.slaPolicyId));
  const bulkReassign = useBulkReassignClaims();
  const bulkWithdraw = useBulkWithdrawClaims();
  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  const columns = React.useMemo<ColumnDef<Claim>[]>(
    () => [
      selectionColumn<Claim>(),
      {
        accessorKey: 'claimNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Claim #" />,
        meta: { label: 'Claim #' },
        cell: ({ row }) => (
          <Link href={`/claims/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.claimNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={claimStatusVariant(row.original.status)}>{claimStatusLabel(row.original.status)}</Badge>,
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
        id: 'policy',
        header: 'Policy',
        meta: { label: 'Policy' },
        accessorFn: (c) => policyById.get(c.policyId)?.name ?? c.policyId,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'adjuster',
        header: 'Adjuster',
        meta: { label: 'Adjuster' },
        accessorFn: (c) => (c.adjusterId ? (usersById.get(c.adjusterId)?.fullName ?? c.adjusterId) : '—'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'dateOfLoss',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Date of loss" />,
        meta: { label: 'Date of loss' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.dateOfLoss)}</span>,
        sortingFn: (a, b) => new Date(a.original.dateOfLoss).getTime() - new Date(b.original.dateOfLoss).getTime(),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Claim actions">
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
    [clocksByEntityId, policyById, usersById],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Claims"
        description="Insurance claims from notification through settlement."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New claim
          </Button>
        }
      />

      <ClaimStatsStrip stats={claimStats} isLoading={claimStatsLoading} />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All statuses</SelectItem>
                {CLAIM_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {claimStatusLabel(s)}
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
                {CASE_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {casePriorityLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-56">
            <label className="text-xs font-medium text-muted-foreground">Adjuster</label>
            <Select value={adjusterId} onValueChange={setAdjusterId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any adjuster</SelectItem>
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
        reassignLabel="Reassign adjuster"
        onReassign={(adjusterId) => bulkReassign.mutate({ ids: selectedIds, adjusterId }, { onSuccess: () => setRowSelection({}) })}
        isReassigning={bulkReassign.isPending}
        secondaryLabel="Withdraw"
        secondaryIcon={Ban}
        secondaryConfirmTitle={`Withdraw ${selectedIds.length} claim${selectedIds.length === 1 ? '' : 's'}?`}
        secondaryConfirmDescription="Marks each selected claim WITHDRAWN — the closest terminal, no-payout status a bulk action can safely apply (SETTLED/REPUDIATED both need per-claim amount/reason and stay on the claim detail page). A claim already SETTLED/REPUDIATED/WITHDRAWN will report a failure rather than being skipped silently."
        onSecondaryAction={() => bulkWithdraw.mutate(selectedIds, { onSuccess: () => setRowSelection({}) })}
        isSecondaryPending={bulkWithdraw.isPending}
      />

      {isFetching && !isLoading ? (
        <div className="flex justify-end">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : null}

      {!isLoading && !isError && claims.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No claims match these filters"
              description="Try clearing a filter, or create a new claim to get started."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New claim
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Claim, unknown>
          columns={columns}
          data={claims}
          getRowId={(c) => c.id}
          isLoading={isLoading}
          isError={isError}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={claims.length}
          enableColumnVisibility
        />
      )}

      <ClaimFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ClaimFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} claim={editing ?? undefined} />
    </div>
  );
}

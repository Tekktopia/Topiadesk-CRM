'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pencil, Search, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  Input,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  selectionColumn,
} from '@topiadesk/ui';
import { BulkActionToolbar } from '../../_components/bulk-action-toolbar';
import { EmptyState } from '../../_components/empty-state';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { formatCurrency, formatDate } from '../../_lib/format';
import { useBulkAssignOpportunities, useBulkDeleteOpportunities, useDeleteOpportunity } from '../../_lib/hooks';
import type { DirectoryUser, Opportunity, PipelineStage } from '../../_lib/types';
import { OpportunityFormDialog } from './opportunity-form-dialog';

const ALL = '__all__';

/**
 * Table/list counterpart to the Kanban board — same underlying data (no
 * separate fetch, no double-loading on toggle), but with what a board
 * can't offer: free-text search, stage/owner filters, and row-level
 * edit/delete. Kanban stays the tool for moving a deal through stages;
 * this is the tool for finding and bulk-managing many at once.
 */
export function OpportunitiesTableView({
  opportunities,
  stages,
  accountsById,
  usersById,
  isLoading,
}: {
  opportunities: Opportunity[];
  stages: PipelineStage[];
  accountsById: Map<string, { name: string }>;
  usersById: Map<string, DirectoryUser>;
  isLoading: boolean;
}) {
  const [search, setSearch] = React.useState('');
  const [stageFilter, setStageFilter] = React.useState(ALL);
  const [ownerFilter, setOwnerFilter] = React.useState(ALL);
  const [editTarget, setEditTarget] = React.useState<Opportunity | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Opportunity | null>(null);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const deleteMutation = useDeleteOpportunity();
  const bulkAssign = useBulkAssignOpportunities();
  const bulkDelete = useBulkDeleteOpportunities();
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const stagesById = new Map(stages.map((s) => [s.id, s]));
  const owners = [...new Map(opportunities.map((o) => [o.ownerId, usersById.get(o.ownerId)?.fullName ?? o.ownerId])).entries()];

  const filtered = opportunities.filter((o) => {
    if (stageFilter !== ALL && o.pipelineStageId !== stageFilter) return false;
    if (ownerFilter !== ALL && o.ownerId !== ownerFilter) return false;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      const haystack = `${o.name} ${accountsById.get(o.accountId)?.name ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const columns = React.useMemo<ColumnDef<Opportunity>[]>(
    () => [
      selectionColumn<Opportunity>(),
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => (
          <Link href={`/opportunities/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'account',
        header: 'Account',
        accessorFn: (o) => accountsById.get(o.accountId)?.name ?? o.accountId,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'stage',
        header: 'Stage',
        accessorFn: (o) => stagesById.get(o.pipelineStageId)?.name ?? '—',
        cell: ({ row, getValue }) => {
          const stage = stagesById.get(row.original.pipelineStageId);
          return <Badge variant={stage?.isWon ? 'success' : stage?.isLost ? 'destructive' : 'outline'}>{getValue<string>()}</Badge>;
        },
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Amount" />,
        cell: ({ row }) => <span className="tabular-nums">{formatCurrency(row.original.amount)}</span>,
      },
      {
        accessorKey: 'probability',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Probability" />,
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.probability}%</span>,
      },
      {
        accessorKey: 'expectedCloseDate',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Expected close" />,
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.expectedCloseDate)}</span>,
      },
      {
        id: 'owner',
        header: 'Owner',
        accessorFn: (o) => usersById.get(o.ownerId)?.fullName ?? o.ownerId,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.name}`} onClick={() => setEditTarget(row.original)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${row.original.name}`} onClick={() => setPendingDelete(row.original)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [accountsById, stagesById, usersById],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input placeholder="Search name or account…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stages</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All owners</SelectItem>
            {owners.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <BulkActionToolbar
        selectedCount={selectedIds.length}
        onClearSelection={() => setRowSelection({})}
        reassignLabel="Reassign owner"
        onReassign={(ownerId) => bulkAssign.mutate({ ids: selectedIds, ownerId }, { onSuccess: () => setRowSelection({}) })}
        isReassigning={bulkAssign.isPending}
        onDelete={() => bulkDelete.mutate({ ids: selectedIds }, { onSuccess: () => setRowSelection({}) })}
        isDeleting={bulkDelete.isPending}
        entityNamePlural="opportunities"
      />

      {isLoading ? null : filtered.length === 0 ? (
        <EmptyState title="No opportunities match these filters" />
      ) : (
        <DataTable<Opportunity, unknown>
          columns={columns}
          data={filtered}
          getRowId={(o) => o.id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      {editTarget ? (
        <OpportunityFormDialog opportunity={editTarget} open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)} />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open={!!pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete "${pendingDelete.name}"?`}
          description="This permanently removes the opportunity. This can't be undone."
          confirmLabel="Delete"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })}
        />
      ) : null}
    </div>
  );
}

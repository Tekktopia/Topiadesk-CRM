'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Badge, type ColumnDef, DataTable, DataTableColumnHeader, type RowSelectionState, selectionColumn } from '@topiadesk/ui';
import { BulkActionToolbar } from '../../../_components/bulk-action-toolbar';
import { EmptyState } from '../../../_components/empty-state';
import { casePriorityLabel, casePriorityVariant, caseStatusLabel, caseStatusVariant } from '../../../_lib/constants';
import { formatDate } from '../../../_lib/format';
import { useBulkCloseCases, useBulkReassignCases, useCases } from '../../../_lib/hooks';
import type { Case } from '../../../_lib/types';

/** "Related tickets" (children linked via parentCaseId) — real Case.childCases relation that previously had no list view anywhere (only a single "Parent case" link shown on the child, never the reverse). Same bulk-select + BulkActionToolbar pattern already proven on the main ticket list (ticket-workspace.tsx) — no new bulk-action hooks needed. */
export function CaseRelatedTicketsTable({ caseId }: { caseId: string }) {
  const { data, isLoading } = useCases({ parentCaseId: caseId });
  const cases = data ?? [];
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const bulkReassign = useBulkReassignCases();
  const bulkClose = useBulkCloseCases();
  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

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
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        meta: { label: 'Created' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
      },
    ],
    [],
  );

  if (!isLoading && cases.length === 0) {
    return <EmptyState title="No related tickets" description="Use “Link child” above to connect another ticket to this one." />;
  }

  return (
    <div className="space-y-3">
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
      <DataTable<Case, unknown>
        columns={columns}
        data={cases}
        getRowId={(c) => c.id}
        isLoading={isLoading}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />
    </div>
  );
}

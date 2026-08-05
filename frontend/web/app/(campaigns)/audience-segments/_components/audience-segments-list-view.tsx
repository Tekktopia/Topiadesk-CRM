'use client';

import * as React from 'react';
import { Link2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import { SegmentPreviewDialog } from '../../_components/segment-preview-dialog';
import { formatDate } from '../../_lib/format';
import { useAudienceSegments, useDeleteAudienceSegment } from '../../_lib/hooks';
import type { AudienceSegment } from '../../_lib/types';
import { AudienceSegmentFormDialog } from './audience-segment-form-dialog';

// Stable empty object — see EMPTY_ROW_SELECTION comment in
// app/(knowledge)/knowledge/knowledge-list-view.tsx. Workaround for a
// data-table.tsx bug where an omitted `rowSelection` prop crashes every
// real row via TanStack's unguarded `selection[row.id]`.
const EMPTY_ROW_SELECTION: RowSelectionState = {};

export function AudienceSegmentsListView() {
  const { data: liveData, isLoading, isError } = useAudienceSegments();
  const data = liveData ?? [];
  const deleteSegment = useDeleteAudienceSegment();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AudienceSegment | null>(null);
  const [previewing, setPreviewing] = React.useState<AudienceSegment | null>(null);
  const [deleting, setDeleting] = React.useState<AudienceSegment | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const columns = React.useMemo<ColumnDef<AudienceSegment>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        meta: { label: 'Description' },
        enableSorting: false,
        cell: ({ row }) => <span className="block max-w-xs truncate text-muted-foreground">{row.original.description ?? '—'}</span>,
      },
      {
        id: 'type',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Type" />,
        meta: { label: 'Type' },
        accessorFn: (s) => (s.isDynamic ? 'Dynamic' : 'Frozen'),
        cell: ({ row }) => <Badge variant={row.original.isDynamic ? 'secondary' : 'outline'}>{row.original.isDynamic ? 'Dynamic' : 'Frozen'}</Badge>,
      },
      {
        id: 'conditions',
        header: 'Conditions',
        meta: { label: 'Conditions' },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.filters.conditions.length === 0
              ? 'Everyone'
              : `${row.original.filters.conditions.length} (${row.original.filters.match === 'ALL' ? 'AND' : 'OR'})`}
          </span>
        ),
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
              <Button variant="ghost" size="icon" aria-label="Segment actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setPreviewing(row.original)}>
                <Link2 aria-hidden /> Preview audience
              </DropdownMenuItem>
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
        title="Audience segments"
        description="Reusable contact criteria — target campaigns by policy, renewal, premium, and opportunity data, not just contact fields."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New segment
          </Button>
        }
      />

      {!isLoading && !isError && data.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No audience segments yet"
              description="Create a segment to define who your campaigns target."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New segment
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <DataTable<AudienceSegment, unknown>
              columns={columns}
              data={data}
              getRowId={(s) => s.id}
              rowSelection={EMPTY_ROW_SELECTION}
              isLoading={isLoading}
              isError={isError}
              pagination={pagination}
              onPaginationChange={setPagination}
              totalRowCount={data.length}
            />
          </CardContent>
        </Card>
      )}

      <AudienceSegmentFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? (
        <AudienceSegmentFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} segment={editing} />
      ) : null}
      {previewing ? (
        <SegmentPreviewDialog
          open={Boolean(previewing)}
          onOpenChange={(open) => !open && setPreviewing(null)}
          segmentId={previewing.id}
          filters={previewing.filters}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the audience segment. This cannot be undone."
        confirmLabel="Delete segment"
        destructive
        isPending={deleteSegment.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteSegment.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

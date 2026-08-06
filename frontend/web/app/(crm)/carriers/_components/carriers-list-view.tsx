'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import { carrierPanelStatusLabel, carrierPanelStatusVariant, carrierTypeLabel } from '../../_lib/constants';
import { useCarriers, useDeleteCarrier } from '../../_lib/hooks';
import type { Carrier } from '../../_lib/types';
import { CarrierFormDialog } from './carrier-form-dialog';

export function CarriersListView() {
  const { data, isLoading, isError } = useCarriers();
  const deleteCarrier = useDeleteCarrier();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Carrier | null>(null);
  const [deleting, setDeleting] = React.useState<Carrier | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // No bulk actions on this page (no selection column in `columns` below), but
  // DataTable's row.getIsSelected() is called unconditionally per row — it
  // throws if `rowSelection` state is left undefined instead of `{}`. See
  // packages/ui/src/composite/data-table.tsx: unlike `sorting`/`columnVisibility`,
  // the `rowSelection` state has no internal-state fallback when the prop is
  // omitted.
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const rows = data ?? [];

  const columns = React.useMemo<ColumnDef<Carrier>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => (
          <Link href={`/carriers/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'type',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Type" />,
        meta: { label: 'Type' },
        accessorFn: (c) => carrierTypeLabel(c.carrierType),
        cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge>,
      },
      {
        accessorKey: 'amBestRating',
        header: ({ column }) => <DataTableColumnHeader column={column} label="A.M. Best" />,
        meta: { label: 'A.M. Best' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.amBestRating ?? '—'}</span>,
      },
      {
        id: 'linesOfBusiness',
        header: 'Lines of business',
        meta: { label: 'Lines of business' },
        enableSorting: false,
        accessorFn: (c) => (c.linesOfBusiness.length > 0 ? c.linesOfBusiness.join(', ') : '—'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'panelStatus',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Panel status" />,
        meta: { label: 'Panel status' },
        cell: ({ row }) =>
          row.original.panelStatus ? (
            <Badge variant={carrierPanelStatusVariant(row.original.panelStatus)}>{carrierPanelStatusLabel(row.original.panelStatus)}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Carrier actions">
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
        title="Carriers"
        description="Insurers and reinsurers on your placement panel."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New carrier
          </Button>
        }
      />

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No carriers yet"
              description="Add insurers and reinsurers to shop opportunities to them."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New carrier
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Carrier, unknown>
          columns={columns}
          data={rows}
          getRowId={(c) => c.id}
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

      <CarrierFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? (
        <CarrierFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} carrier={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the carrier. This cannot be undone."
        confirmLabel="Delete carrier"
        destructive
        isPending={deleteCarrier.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteCarrier.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

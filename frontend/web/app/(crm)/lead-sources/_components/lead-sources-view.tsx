'use client';

import * as React from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
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
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { useDeleteLeadSource, useLeadSources, useUpdateLeadSource } from '../../_lib/hooks';
import type { LeadSourceOption } from '../../_lib/types';
import { LeadSourceFormDialog } from './lead-source-form-dialog';

function ToggleActiveItem({ source }: { source: LeadSourceOption }) {
  const updateSource = useUpdateLeadSource(source.id);
  return (
    <DropdownMenuItem onSelect={() => updateSource.mutate({ isActive: !source.isActive })}>
      {source.isActive ? 'Deactivate' : 'Activate'}
    </DropdownMenuItem>
  );
}

export function LeadSourcesView() {
  const { data, isLoading, isError } = useLeadSources();
  const deleteSource = useDeleteLeadSource();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LeadSourceOption | null>(null);
  const [deleting, setDeleting] = React.useState<LeadSourceOption | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const rows = data ?? [];

  const columns = React.useMemo<ColumnDef<LeadSourceOption>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: 'code',
        header: 'Code',
        meta: { label: 'Code' },
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'outline'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        accessorKey: 'sortOrder',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Order" />,
        meta: { label: 'Order' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.sortOrder}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Lead source actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              <ToggleActiveItem source={row.original} />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                Delete
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
        title="Lead Sources"
        description="The options shown in the Lead source dropdown — add, reorder, deactivate, or delete without a code deploy."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New source
          </Button>
        }
      />

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No lead sources yet"
              description="Add one to make it available on the Lead create/edit form."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New source
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<LeadSourceOption, unknown>
          columns={columns}
          data={rows}
          getRowId={(d) => d.id}
          isLoading={isLoading}
          isError={isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={rows.length}
        />
      )}

      <LeadSourceFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? <LeadSourceFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} source={editing} /> : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the lead source. Blocked if any Lead still uses it — deactivate it instead to retire it without breaking historical records."
        confirmLabel="Delete source"
        destructive
        isPending={deleteSource.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteSource.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

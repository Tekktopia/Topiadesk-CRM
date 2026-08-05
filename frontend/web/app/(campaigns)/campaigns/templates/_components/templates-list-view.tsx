'use client';

import * as React from 'react';
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
import { ConfirmDialog } from '../../../_components/confirm-dialog';
import { EmptyState } from '../../../_components/empty-state';
import { PageHeader } from '../../../_components/page-header';
import { channelLabel } from '../../../_lib/constants';
import { formatDate } from '../../../_lib/format';
import { useCampaignTemplates, useDeleteCampaignTemplate } from '../../../_lib/hooks';
import type { CampaignTemplate } from '../../../_lib/types';
import { TemplateFormDialog } from './template-form-dialog';

// Stable empty object — see EMPTY_ROW_SELECTION comment in
// app/(knowledge)/knowledge/knowledge-list-view.tsx. Workaround for a
// data-table.tsx bug where an omitted `rowSelection` prop crashes every
// real row via TanStack's unguarded `selection[row.id]`.
const EMPTY_ROW_SELECTION: RowSelectionState = {};

export function TemplatesListView() {
  const { data: liveData, isLoading, isError } = useCampaignTemplates();
  const data = liveData ?? [];
  const deleteTemplate = useDeleteCampaignTemplate();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CampaignTemplate | null>(null);
  const [deleting, setDeleting] = React.useState<CampaignTemplate | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const columns = React.useMemo<ColumnDef<CampaignTemplate>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: 'channel',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Channel" />,
        meta: { label: 'Channel' },
        cell: ({ row }) => <Badge variant="outline">{channelLabel(row.original.channel)}</Badge>,
      },
      {
        accessorKey: 'subject',
        header: 'Subject',
        meta: { label: 'Subject' },
        enableSorting: false,
        cell: ({ row }) => <span className="block max-w-xs truncate text-muted-foreground">{row.original.subject ?? '—'}</span>,
      },
      {
        id: 'mergeFields',
        header: 'Merge fields',
        meta: { label: 'Merge fields' },
        enableSorting: false,
        accessorFn: (t) => t.mergeFields.length,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<number>() || '—'}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
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
              <Button variant="ghost" size="icon" aria-label="Template actions">
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
        title="Campaign templates"
        description="Reusable Email, SMS, and WhatsApp message templates with merge-field placeholders."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New template
          </Button>
        }
      />

      {!isLoading && !isError && data.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No templates yet"
              description="Create a template to define what a campaign actually sends."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New template
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <DataTable<CampaignTemplate, unknown>
              columns={columns}
              data={data}
              getRowId={(t) => t.id}
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

      <TemplateFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? (
        <TemplateFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} template={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the template. This cannot be undone."
        confirmLabel="Delete template"
        destructive
        isPending={deleteTemplate.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteTemplate.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

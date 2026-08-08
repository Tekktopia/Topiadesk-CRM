'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListTree, MoreHorizontal, Network, Plus, Power, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type RowSelectionState,
  selectionColumn,
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { AdminBulkActionToolbar } from '../_components/admin-bulk-action-toolbar';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { WebhookSubscriptionDto } from '../_lib/types';
import { WebhookFormDialog } from './webhook-form-dialog';
import { WebhookDeliveriesDialog } from './webhook-deliveries-dialog';

export default function WebhooksPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const [dialogTarget, setDialogTarget] = useState<'create' | WebhookSubscriptionDto | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<WebhookSubscriptionDto | null>(null);
  const [deleting, setDeleting] = useState<WebhookSubscriptionDto | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const subscriptionsQuery = useQuery({
    queryKey: ['admin', 'webhook-subscriptions'],
    queryFn: () => apiFetch<WebhookSubscriptionDto[]>('/api/admin/webhook-subscriptions'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/webhook-subscriptions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Subscription deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'webhook-subscriptions'] });
      setDeleting(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete subscription'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => apiFetch<void>(`/api/admin/webhook-subscriptions/${id}`, { method: 'DELETE' }))),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} subscription${ids.length === 1 ? '' : 's'} deleted`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'webhook-subscriptions'] });
      setRowSelection({});
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete subscriptions'),
  });

  const bulkToggleActiveMutation = useMutation({
    mutationFn: ({ ids, isActive }: { ids: string[]; isActive: boolean }) =>
      Promise.all(ids.map((id) => apiFetch<WebhookSubscriptionDto>(`/api/admin/webhook-subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }))),
    onSuccess: (_data, { ids }) => {
      toast.success(`${ids.length} subscription${ids.length === 1 ? '' : 's'} updated`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'webhook-subscriptions'] });
      setRowSelection({});
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update subscriptions'),
  });
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const subscriptions = subscriptionsQuery.data ?? [];

  const columns = useMemo<ColumnDef<WebhookSubscriptionDto>[]>(() => {
    const cols: ColumnDef<WebhookSubscriptionDto>[] = [
      selectionColumn<WebhookSubscriptionDto>(),
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: 'targetUrl',
        header: 'Target URL',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-xs truncate font-mono text-xs text-muted-foreground">{row.original.targetUrl}</span>
        ),
      },
      {
        id: 'events',
        header: 'Events',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.eventTypes.slice(0, 2).map((type) => (
              <Badge key={type} variant="outline">
                {type}
              </Badge>
            ))}
            {row.original.eventTypes.length > 2 ? <Badge variant="outline">+{row.original.eventTypes.length - 2} more</Badge> : null}
          </div>
        ),
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${row.original.name}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDeliveriesFor(row.original)}>
                  <ListTree className="h-4 w-4" aria-hidden /> View deliveries
                </DropdownMenuItem>
                {canWrite ? (
                  <>
                    <DropdownMenuItem onSelect={() => setDialogTarget(row.original)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeleting(row.original)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];
    return cols;
  }, [canWrite]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Outbound event notifications to external systems. Deliveries are dispatched asynchronously by the worker — this page manages subscriptions and lets you inspect/retry what was attempted."
        actions={
          canWrite ? (
            <Button onClick={() => setDialogTarget('create')}>
              <Plus aria-hidden /> New subscription
            </Button>
          ) : null
        }
      />

      {canWrite ? (
        <AdminBulkActionToolbar
          selectedCount={selectedIds.length}
          onClearSelection={() => setRowSelection({})}
          actions={[
            {
              label: 'Enable',
              icon: Power,
              isPending: bulkToggleActiveMutation.isPending,
              onClick: () => bulkToggleActiveMutation.mutate({ ids: selectedIds, isActive: true }),
            },
            {
              label: 'Disable',
              icon: Power,
              isPending: bulkToggleActiveMutation.isPending,
              onClick: () => bulkToggleActiveMutation.mutate({ ids: selectedIds, isActive: false }),
            },
            {
              label: 'Delete',
              icon: Trash2,
              destructive: true,
              isPending: bulkDeleteMutation.isPending,
              confirmTitle: `Delete ${selectedIds.length} subscription${selectedIds.length === 1 ? '' : 's'}?`,
              confirmDescription: 'This permanently removes the selected subscriptions and their delivery history.',
              onClick: () => bulkDeleteMutation.mutate(selectedIds),
            },
          ]}
        />
      ) : null}

      {!subscriptionsQuery.isLoading && !subscriptionsQuery.isError && subscriptions.length === 0 ? (
        <EmptyState
          icon={<Network className="h-8 w-8" aria-hidden />}
          title="No webhook subscriptions yet"
          description="Create one to notify an external system when CRM/policy events occur."
        />
      ) : (
        <DataTable<WebhookSubscriptionDto, unknown>
          columns={columns}
          data={subscriptions}
          getRowId={(sub) => sub.id}
          isLoading={subscriptionsQuery.isLoading}
          isError={subscriptionsQuery.isError}
          errorState={<ErrorState error={subscriptionsQuery.error} />}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={subscriptions.length}
          onRowClick={(sub) => setDeliveriesFor(sub)}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      {dialogTarget ? (
        <WebhookFormDialog target={dialogTarget} open={!!dialogTarget} onOpenChange={(open) => !open && setDialogTarget(null)} />
      ) : null}

      {deliveriesFor ? (
        <WebhookDeliveriesDialog
          subscription={deliveriesFor}
          open={!!deliveriesFor}
          onOpenChange={(open) => !open && setDeliveriesFor(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete "${deleting.name}"?`}
          description="This permanently removes the subscription and its delivery history. Events will no longer be sent to this target."
          confirmLabel="Delete subscription"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      ) : null}
    </div>
  );
}

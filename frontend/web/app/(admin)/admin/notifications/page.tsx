'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  selectionColumn,
  type RowSelectionState,
  toast,
} from '@topiadesk/ui';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import type { NotificationDto } from '../_lib/types';

const UNSET = '__any';
const TAKE = 50;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [type, setType] = useState('');
  const [isRead, setIsRead] = useState<string>(UNSET);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: TAKE });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const debouncedType = useDebounced(type, 300);

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setRowSelection({});
  }, [debouncedType, isRead]);

  const qs = useMemo(() => {
    const params = new URLSearchParams({ take: String(TAKE), skip: String(pagination.pageIndex * TAKE) });
    if (debouncedType) params.set('type', debouncedType);
    if (isRead !== UNSET) params.set('isRead', isRead);
    return params.toString();
  }, [debouncedType, isRead, pagination.pageIndex]);

  const notificationsQuery = useQuery({
    queryKey: ['admin', 'notifications', qs],
    queryFn: () => apiFetch<NotificationDto[]>(`/api/admin/notifications?${qs}`),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
    // The header bell dropdown polls its own separate query key — refresh
    // it immediately too so a "mark all read"/delete here isn't stale
    // there for up to 60s.
    queryClient.invalidateQueries({ queryKey: ['notifications', 'mine'] });
  }

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiFetch<NotificationDto>(`/api/admin/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: invalidate,
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to mark as read'),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiFetch<{ count: number }>('/api/admin/notifications/read-all', { method: 'PATCH' }),
    onSuccess: ({ count }) => {
      toast.success(count > 0 ? `Marked ${count} notification${count === 1 ? '' : 's'} as read` : 'Nothing to mark read');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to mark all as read'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ deleted: boolean }>(`/api/admin/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Notification deleted');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ requested: string[]; affected: string[]; skipped: string[] }>('/api/admin/notifications/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: ({ affected }) => {
      toast.success(`Deleted ${affected.length} notification${affected.length === 1 ? '' : 's'}`);
      setRowSelection({});
      setConfirmBulkDelete(false);
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete selected notifications'),
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const columns = useMemo<ColumnDef<NotificationDto>[]>(
    () => [
      selectionColumn<NotificationDto>(),
      {
        accessorKey: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Notification" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              {!row.original.readAt ? <span className="h-1.5 w-1.5 shrink-0 rounded-none bg-primary" aria-hidden /> : null}
              <span className="text-sm font-medium text-foreground">{row.original.title}</span>
              <Badge variant="outline" className="text-[10px]">
                {row.original.type}
              </Badge>
            </div>
            <p className="line-clamp-1 text-sm text-muted-foreground">{row.original.body}</p>
          </div>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Received" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleString()}</span>
        ),
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {!row.original.readAt ? (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={markReadMutation.isPending}
                onClick={() => markReadMutation.mutate(row.original.id)}
              >
                <Check className="h-4 w-4" /> Mark read
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Delete notification"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [markReadMutation, deleteMutation],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread — this is your own inbox (RLS-scoped), not an org-wide feed.`
            : 'Your own inbox (RLS-scoped) — up to the most recent 50 notifications.'
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={unreadCount === 0 || markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
            >
              <CheckCheck className="h-4 w-4" /> Mark all as read
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/notifications/all">All notifications</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="Filter by type…" value={type} onChange={(e) => setType(e.target.value)} className="sm:w-56" />
        <Select value={isRead} onValueChange={setIsRead}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Read status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>Any status</SelectItem>
            <SelectItem value="false">Unread</SelectItem>
            <SelectItem value="true">Read</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.length > 0 ? (
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
            <Button size="sm" variant="destructive" onClick={() => setConfirmBulkDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete selected
            </Button>
          </div>
        ) : null}
      </div>

      {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 ? (
        <EmptyState
          title="No notifications match these filters"
          icon={<Bell className="h-8 w-8" aria-hidden />}
          description={debouncedType || isRead !== UNSET ? 'Try clearing a filter.' : "You're all caught up."}
        />
      ) : (
        <DataTable<NotificationDto, unknown>
          columns={columns}
          data={notifications}
          getRowId={(n) => n.id}
          isLoading={notificationsQuery.isLoading}
          isError={notificationsQuery.isError}
          errorState={<ErrorState error={notificationsQuery.error} />}
          pagination={pagination}
          onPaginationChange={setPagination}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          // Server-paginated (skip/take), so the table can't know the true
          // total — hasNextPage is inferred from a full page coming back,
          // same convention as audit-log/page.tsx.
          totalRowCount={pagination.pageIndex * TAKE + notifications.length + (notifications.length === TAKE ? 1 : 0)}
        />
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedIds.length} notification${selectedIds.length === 1 ? '' : 's'}?`}
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        isPending={bulkDeleteMutation.isPending}
        onConfirm={() => bulkDeleteMutation.mutate(selectedIds)}
      />
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { Badge, Button, type ColumnDef, DataTable, DataTableColumnHeader, toast } from '@topiadesk/ui';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { apiFetch } from '../_lib/api';
import type { NotificationDto } from '../_lib/types';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const notificationsQuery = useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: () => apiFetch<NotificationDto[]>('/api/admin/notifications'),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiFetch<NotificationDto>(`/api/admin/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to mark as read'),
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const columns = useMemo<ColumnDef<NotificationDto>[]>(
    () => [
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
        cell: ({ row }) =>
          !row.original.readAt ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={markReadMutation.isPending}
              onClick={() => markReadMutation.mutate(row.original.id)}
            >
              <Check className="h-4 w-4" /> Mark read
            </Button>
          ) : null,
      },
    ],
    [markReadMutation],
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
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/notifications/all">All notifications</Link>
          </Button>
        }
      />

      {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 ? (
        <EmptyState title="No notifications" icon={<Bell className="h-8 w-8" aria-hidden />} description="You're all caught up." />
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
          totalRowCount={notifications.length}
        />
      )}
    </div>
  );
}

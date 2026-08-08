'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, RotateCcw } from 'lucide-react';
import {
  Badge,
  Button,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { PageHeader } from '../../_components/page-header';
import { EmptyState, ErrorState } from '../../_components/query-states';
import { apiFetch } from '../../_lib/api';
import { useUsers } from '../../_lib/queries';
import type { AdminNotificationDto } from '../../_lib/types';

const UNSET = '__any';
const CHANNELS = ['IN_APP', 'EMAIL', 'SMS'] as const;
const STATUSES = ['PENDING', 'SENT', 'FAILED', 'READ'] as const;

const STATUS_VARIANT: Record<string, 'success' | 'secondary' | 'destructive' | 'outline'> = {
  SENT: 'success',
  READ: 'success',
  PENDING: 'secondary',
  FAILED: 'destructive',
};

/**
 * Org-wide notification browsing — distinct from /admin/notifications
 * (that page is explicitly the signed-in admin's own personal inbox, RLS-
 * scoped). This reads GET /notifications/admin, which RLS additionally
 * permits for ALL-scope 'identity' readers (see notifications_rw,
 * prisma/rls/002_policies.sql); a non-ALL-scope caller just sees their own
 * rows here too, gracefully narrowed rather than erroring.
 */
export default function AllNotificationsPage() {
  const queryClient = useQueryClient();
  const usersQuery = useUsers();

  const [recipientUserId, setRecipientUserId] = useState(UNSET);
  const [channel, setChannel] = useState(UNSET);
  const [status, setStatus] = useState(UNSET);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (recipientUserId !== UNSET) params.set('recipientUserId', recipientUserId);
    if (channel !== UNSET) params.set('channel', channel);
    if (status !== UNSET) params.set('status', status);
    return params.toString();
  }, [recipientUserId, channel, status]);

  const notificationsQuery = useQuery({
    queryKey: ['admin', 'notifications', 'all', qs],
    queryFn: () => apiFetch<AdminNotificationDto[]>(`/api/admin/notifications/all?${qs}`),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => apiFetch<AdminNotificationDto>(`/api/admin/notifications/${id}/resend`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Notification re-queued — it will send on the next dispatch cycle');
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', 'all'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to resend'),
  });

  const notifications = notificationsQuery.data ?? [];

  const columns = useMemo<ColumnDef<AdminNotificationDto>[]>(
    () => [
      {
        id: 'recipient',
        header: 'Recipient',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{row.original.recipient.fullName}</span>
            <span className="text-xs text-muted-foreground">{row.original.recipient.email}</span>
          </div>
        ),
      },
      {
        accessorKey: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Notification" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
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
        accessorKey: 'channel',
        header: 'Channel',
        cell: ({ row }) => <Badge variant="outline">{row.original.channel}</Badge>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status] ?? 'secondary'}>{row.original.status}</Badge>,
      },
      {
        id: 'relatedEntity',
        header: 'Related to',
        cell: ({ row }) =>
          row.original.relatedEntityType ? (
            <span className="text-xs text-muted-foreground">
              {row.original.relatedEntityType} <span className="font-mono">{row.original.relatedEntityId}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleString()}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === 'FAILED' && row.original.channel === 'EMAIL' ? (
            <Button size="sm" variant="outline" disabled={resendMutation.isPending} onClick={() => resendMutation.mutate(row.original.id)}>
              <RotateCcw className="h-4 w-4" /> Resend
            </Button>
          ) : null,
      },
    ],
    [resendMutation],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="All notifications"
        description="Every notification the system has sent, across every user — up to the most recent 200. Failed emails can be re-queued for another delivery attempt."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/notifications">My inbox</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={recipientUserId} onValueChange={setRecipientUserId}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Recipient" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>Any recipient</SelectItem>
            {(usersQuery.data ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>Any channel</SelectItem>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>Any status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 ? (
        <EmptyState title="No notifications match these filters" icon={<Bell className="h-8 w-8" aria-hidden />} />
      ) : (
        <DataTable<AdminNotificationDto, unknown>
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

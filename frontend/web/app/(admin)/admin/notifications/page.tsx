'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton, toast } from '@topiadesk/ui';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { apiFetch } from '../_lib/api';
import type { NotificationDto } from '../_lib/types';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
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

  const unreadCount = (notificationsQuery.data ?? []).filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread — this is your own inbox (RLS-scoped), not an org-wide feed.`
            : 'Your own inbox (RLS-scoped) — up to the most recent 50 notifications.'
        }
      />

      {notificationsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : notificationsQuery.isError ? (
        <ErrorState error={notificationsQuery.error} />
      ) : (notificationsQuery.data ?? []).length === 0 ? (
        <EmptyState title="No notifications" icon={<Bell className="h-8 w-8" aria-hidden />} description="You're all caught up." />
      ) : (
        <div className="space-y-2">
          {notificationsQuery.data?.map((n) => (
            <Card key={n.id} className={!n.readAt ? 'border-primary/40 bg-primary/5' : undefined}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {n.type}
                    </Badge>
                    {!n.readAt ? <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.readAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={markReadMutation.isPending}
                    onClick={() => markReadMutation.mutate(n.id)}
                  >
                    <Check className="h-4 w-4" /> Mark read
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

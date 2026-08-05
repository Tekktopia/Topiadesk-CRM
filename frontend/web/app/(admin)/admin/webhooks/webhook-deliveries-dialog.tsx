'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { EmptyState, ErrorState } from '../_components/query-states';
import { WebhookDeliveryStatusBadge } from '../_components/status-badge';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { WebhookDeliveryDto, WebhookSubscriptionDto } from '../_lib/types';
import { useCurrentUser } from '@/lib/auth/use-current-user';

export function WebhookDeliveriesDialog({
  subscription,
  open,
  onOpenChange,
}: {
  subscription: WebhookSubscriptionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const deliveriesQuery = useQuery({
    queryKey: ['admin', 'webhook-subscriptions', subscription.id, 'deliveries'],
    queryFn: () => apiFetch<WebhookDeliveryDto[]>(`/api/admin/webhook-subscriptions/${subscription.id}/deliveries`),
    enabled: open,
  });

  const redeliverMutation = useMutation({
    mutationFn: (deliveryId: string) =>
      apiFetch<WebhookDeliveryDto>(`/api/admin/webhook-subscriptions/${subscription.id}/deliveries/${deliveryId}/redeliver`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Delivery re-queued — the worker will retry it on its next poll');
      queryClient.invalidateQueries({ queryKey: ['admin', 'webhook-subscriptions', subscription.id, 'deliveries'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to re-queue delivery'),
  });

  const deliveries = deliveriesQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Deliveries — {subscription.name}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{subscription.targetUrl}</DialogDescription>
        </DialogHeader>

        {deliveriesQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : deliveriesQuery.isError ? (
          <ErrorState error={deliveriesQuery.error} />
        ) : deliveries.length === 0 ? (
          <EmptyState title="No deliveries yet" description="Deliveries appear here once a matching event fires and the worker attempts to send it." />
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HTTP status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Last attempt</TableHead>
                  {canWrite ? <TableHead className="w-10" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="text-sm text-foreground">{delivery.eventType}</TableCell>
                    <TableCell>
                      <WebhookDeliveryStatusBadge status={delivery.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{delivery.responseStatus ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{delivery.attemptCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {delivery.lastAttemptAt ? new Date(delivery.lastAttemptAt).toLocaleString() : 'Not attempted yet'}
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        {delivery.status === 'FAILED' || delivery.status === 'EXHAUSTED' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Retry delivery"
                            disabled={redeliverMutation.isPending}
                            onClick={() => redeliverMutation.mutate(delivery.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

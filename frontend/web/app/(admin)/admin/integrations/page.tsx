'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, RefreshCw } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { SyncJobStatusBadge } from '../_components/status-badge';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { ConnectorDto, SyncJobDto } from '../_lib/types';
import { SyncJobLogsDialog } from './sync-job-logs-dialog';

export default function IntegrationsPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const connectorsQuery = useQuery({
    queryKey: ['admin', 'integrations', 'connectors'],
    queryFn: () => apiFetch<ConnectorDto[]>('/api/admin/integrations/connectors'),
  });

  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [logsJobId, setLogsJobId] = useState<string | null>(null);

  useEffect(() => {
    const first = connectorsQuery.data?.[0];
    if (!selectedConnectorId && first) {
      setSelectedConnectorId(first.id);
    }
  }, [connectorsQuery.data, selectedConnectorId]);

  const syncJobsQuery = useQuery({
    queryKey: ['admin', 'integrations', 'sync-jobs', selectedConnectorId],
    queryFn: () => apiFetch<SyncJobDto[]>(`/api/admin/integrations/connectors/${selectedConnectorId}/sync-jobs`),
    enabled: !!selectedConnectorId,
  });

  const triggerSyncMutation = useMutation({
    mutationFn: (connectorId: string) =>
      apiFetch<SyncJobDto>(`/api/admin/integrations/connectors/${connectorId}/sync`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Sync job triggered');
      queryClient.invalidateQueries({ queryKey: ['admin', 'integrations', 'sync-jobs'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to trigger sync'),
  });

  const selectedConnector = connectorsQuery.data?.find((c) => c.id === selectedConnectorId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Connector health, sync job history, and per-job logs. Monitoring is read-only; triggering a sync requires an integration:write grant (ADMIN only, per the seeded role grid)."
      />

      {connectorsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : connectorsQuery.isError ? (
        <ErrorState error={connectorsQuery.error} />
      ) : (connectorsQuery.data ?? []).length === 0 ? (
        <EmptyState title="No connectors configured" icon={<Network className="h-8 w-8" aria-hidden />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardContent className="space-y-1 p-2">
              {connectorsQuery.data?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedConnectorId(c.id)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    c.id === selectedConnectorId ? 'bg-secondary text-secondary-foreground' : 'hover:bg-secondary/50'
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2 font-medium text-foreground">
                    {c.name}
                    <Badge variant={c.isEnabled ? 'success' : 'secondary'}>{c.isEnabled ? 'Enabled' : 'Disabled'}</Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">{c.connectorType}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedConnector ? (
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{selectedConnector.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Last successful sync:{' '}
                      {selectedConnector.lastSuccessfulSyncAt
                        ? new Date(selectedConnector.lastSuccessfulSyncAt).toLocaleString()
                        : 'never'}
                    </p>
                  </div>
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={triggerSyncMutation.isPending}
                      onClick={() => triggerSyncMutation.mutate(selectedConnector.id)}
                    >
                      <RefreshCw className="h-4 w-4" /> Trigger sync
                    </Button>
                  ) : null}
                </div>

                {syncJobsQuery.isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : syncJobsQuery.isError ? (
                  <ErrorState error={syncJobsQuery.error} />
                ) : (syncJobsQuery.data ?? []).length === 0 ? (
                  <EmptyState title="No sync jobs yet for this connector" />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead>Records (ok/fail)</TableHead>
                          <TableHead>Correlation ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {syncJobsQuery.data?.map((job) => (
                          <TableRow key={job.id} className="cursor-pointer" onClick={() => setLogsJobId(job.id)}>
                            <TableCell className="text-sm text-foreground">{job.jobType}</TableCell>
                            <TableCell>
                              <SyncJobStatusBadge status={job.status} />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {job.startedAt ? new Date(job.startedAt).toLocaleString() : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {job.recordsSucceeded}/{job.recordsProcessed} ok · {job.recordsFailed} failed
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{job.correlationId}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {logsJobId ? (
        <SyncJobLogsDialog syncJobId={logsJobId} open={!!logsJobId} onOpenChange={(open) => !open && setLogsJobId(null)} />
      ) : null}
    </div>
  );
}

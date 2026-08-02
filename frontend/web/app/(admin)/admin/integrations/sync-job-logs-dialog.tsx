'use client';

import { useQuery } from '@tanstack/react-query';
import {
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
} from '@topiadesk/ui';
import { EmptyState, ErrorState } from '../_components/query-states';
import { LogLevelBadge } from '../_components/status-badge';
import { apiFetch } from '../_lib/api';
import type { IntegrationLogDto } from '../_lib/types';

export function SyncJobLogsDialog({
  syncJobId,
  open,
  onOpenChange,
}: {
  syncJobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const logsQuery = useQuery({
    queryKey: ['admin', 'integrations', 'sync-job-logs', syncJobId],
    queryFn: () => apiFetch<IntegrationLogDto[]>(`/api/admin/integrations/sync-jobs/${syncJobId}/logs`),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sync job logs</DialogTitle>
          <DialogDescription className="font-mono text-xs">{syncJobId}</DialogDescription>
        </DialogHeader>

        {logsQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : logsQuery.isError ? (
          <ErrorState error={logsQuery.error} />
        ) : (logsQuery.data ?? []).length === 0 ? (
          <EmptyState title="No log entries for this job" />
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsQuery.data?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <LogLevelBadge level={log.level} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.category}</TableCell>
                    <TableCell className="max-w-xs text-sm text-foreground">{log.message}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.internalEntityType ? `${log.internalEntityType}${log.externalRecordId ? ` (${log.externalRecordId})` : ''}` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</TableCell>
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

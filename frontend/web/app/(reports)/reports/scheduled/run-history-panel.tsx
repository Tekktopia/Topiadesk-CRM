'use client';

import { Play } from 'lucide-react';
import type { BadgeProps } from '@topiadesk/ui';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@topiadesk/ui';
import { formatDateTime } from '../../_lib/format';
import { useDownloadScheduledReportRun, useRunScheduledReportNow, useScheduledReportRuns } from '../../_lib/hooks';
import type { ScheduledReport } from '../../_lib/types';

type Variant = NonNullable<BadgeProps['variant']>;

const STATUS_VARIANT: Record<string, Variant> = {
  PENDING: 'outline',
  RUNNING: 'default',
  SUCCEEDED: 'success',
  FAILED: 'destructive',
};

/**
 * Run history for the selected ScheduledReport — GET /scheduled-reports/:id/
 * runs (most recent 50). There is no backend endpoint exposing
 * ScheduledReportDelivery (per-recipient send status) outside the worker's
 * own internals (confirmed against scheduled-reports.controller.ts — only
 * run-level status is returned), so this shows run-level status/row count/
 * timing/error and a download link per SUCCEEDED run, not a per-recipient
 * delivery breakdown.
 */
export function RunHistoryPanel({ report }: { report: ScheduledReport }) {
  const runsQuery = useScheduledReportRuns(report.id);
  const runNowMutation = useRunScheduledReportNow();
  const downloadMutation = useDownloadScheduledReportRun();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{report.name}</CardTitle>
          <CardDescription>
            {report.reportKey} · next run {formatDateTime(report.nextRunAt)}
            {report.lastRunAt ? ` · last run ${formatDateTime(report.lastRunAt)}` : ''}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => runNowMutation.mutate(report.id)} disabled={runNowMutation.isPending}>
          <Play className="h-3.5 w-3.5" aria-hidden /> Run now
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {runsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : runsQuery.isError ? (
          <p className="p-6 text-sm text-destructive">Couldn&apos;t load run history.</p>
        ) : !runsQuery.data || runsQuery.data.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No runs yet — this report hasn&apos;t fired since it was created.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runsQuery.data.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'}>{run.status}</Badge>
                    {run.errorMessage ? <p className="mt-1 max-w-xs truncate text-xs text-destructive" title={run.errorMessage}>{run.errorMessage}</p> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{run.format}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.rowCount ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(run.startedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(run.completedAt)}</TableCell>
                  <TableCell>
                    {run.status === 'SUCCEEDED' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadMutation.mutate(run.id)}
                        disabled={downloadMutation.isPending}
                      >
                        Download
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

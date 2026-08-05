'use client';

import * as React from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, type ColumnDef, DataTable, DataTableColumnHeader } from '@topiadesk/ui';
import { formatDateTime } from '../../_lib/format';
import { useDeleteScheduledReport, useScheduledReports, useUpdateScheduledReport } from '../../_lib/hooks';
import type { ScheduledReport } from '../../_lib/types';
import { CreateScheduledReportDialog } from './create-scheduled-report-dialog';
import { RunHistoryPanel } from './run-history-panel';

/**
 * Scheduled report CRUD — list + pause/resume + delete, with a run-history
 * panel for whichever row is selected. Creation happens in a Dialog (its
 * own component, since the schema-driven filter form + recipients list
 * make it too large for an inline row form).
 */
export function ScheduledReportsView() {
  const scheduledQuery = useScheduledReports();
  const data = scheduledQuery.data ?? [];
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const selected = data.find((r) => r.id === selectedId) ?? null;

  const columns = React.useMemo<ColumnDef<ScheduledReport>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: 'reportKey',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Report" />,
        meta: { label: 'Report' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.reportKey}</span>,
      },
      {
        accessorKey: 'frequency',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Frequency" />,
        meta: { label: 'Frequency' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.frequency}</span>,
      },
      {
        accessorKey: 'format',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Format" />,
        meta: { label: 'Format' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.format}</span>,
      },
      {
        id: 'recipients',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Recipients" />,
        meta: { label: 'Recipients' },
        accessorFn: (r) => r.recipients.length,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<number>()}</span>,
      },
      {
        accessorKey: 'nextRunAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Next run" />,
        meta: { label: 'Next run' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.nextRunAt)}</span>,
        sortingFn: (a, b) => new Date(a.original.nextRunAt).getTime() - new Date(b.original.nextRunAt).getTime(),
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'outline'}>{row.original.isActive ? 'Active' : 'Paused'}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ScheduledReportRowActions report={row.original} />
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Scheduled reports</h1>
          <p className="text-sm text-muted-foreground">Recurring report delivery by email, in-app notification, or webhook.</p>
        </div>
        <CreateScheduledReportDialog />
      </div>

      <Card>
        <CardContent className="pt-6">
          {!scheduledQuery.isLoading && !scheduledQuery.isError && data.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No scheduled reports yet — create one above.</p>
          ) : (
            <DataTable<ScheduledReport, unknown>
              columns={columns}
              data={data}
              getRowId={(r) => r.id}
              isLoading={scheduledQuery.isLoading}
              isError={scheduledQuery.isError}
              errorState={<p className="text-sm text-destructive">Couldn&apos;t load scheduled reports.</p>}
              onRowClick={(report) => setSelectedId(report.id)}
              rowSelection={selectedId ? { [selectedId]: true } : {}}
              pagination={pagination}
              onPaginationChange={setPagination}
              totalRowCount={data.length}
            />
          )}
        </CardContent>
      </Card>

      {selected ? <RunHistoryPanel report={selected} /> : null}
    </div>
  );
}

function ScheduledReportRowActions({ report }: { report: ScheduledReport }) {
  const updateMutation = useUpdateScheduledReport(report.id);
  const deleteMutation = useDeleteScheduledReport();

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        title={report.isActive ? 'Pause' : 'Resume'}
        onClick={() => updateMutation.mutate({ isActive: !report.isActive })}
        disabled={updateMutation.isPending}
      >
        {report.isActive ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Delete"
        onClick={() => {
          if (window.confirm(`Delete scheduled report "${report.name}"?`)) deleteMutation.mutate(report.id);
        }}
        disabled={deleteMutation.isPending}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

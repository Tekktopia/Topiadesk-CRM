'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@topiadesk/ui';
import { AGING_BUCKET_ORDER, agingBucketLabel, formatDate, formatNaira, premiumStatusVariant } from '@/app/(policy)/lib/format';
import type { PolicyDto, PremiumAgingRowDto } from '@/app/(policy)/lib/types';
import { AgingChart, type AgingBucketSummary } from './aging-chart';
import { RecordPaymentDialog } from './record-payment-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const ALL = 'ALL';

/**
 * Premium aging — GET /premiums/aging (via app/api/premiums/aging), backed
 * by the `premium_aging_summary_scoped` RLS view (only PENDING/
 * PARTIALLY_PAID/OVERDUE premiums appear — PAID ones are excluded by the
 * view itself, see packages/db/prisma/rls/004_reporting_views.sql). The
 * bucket bar chart (AgingChart) is built per the dataviz skill; the table
 * below it lets a user drill into a bucket and record a payment inline.
 */
export function PremiumsView() {
  const queryClient = useQueryClient();
  const [bucket, setBucket] = React.useState(ALL);
  const [recording, setRecording] = React.useState<PremiumAgingRowDto | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // Workaround for a bug in @topiadesk/ui's DataTable — see the matching
  // comment in policies-view.tsx: omitting `rowSelection` entirely (this
  // page has no bulk actions) crashes row rendering because the component's
  // internal state has no fallback for it. A stable empty object avoids
  // that without adding any selection UI.
  const [rowSelection] = React.useState<RowSelectionState>({});

  const agingQuery = useQuery({
    queryKey: ['premiums-aging'],
    queryFn: () => fetchJson<PremiumAgingRowDto[]>('/api/premiums/aging'),
  });
  const policiesQuery = useQuery({
    queryKey: ['policies-lookup'],
    queryFn: () => fetchJson<PolicyDto[]>('/api/policies'),
    staleTime: 5 * 60_000,
  });

  const policyNumberById = React.useMemo(
    () => new Map((policiesQuery.data ?? []).map((p) => [p.id, p.policyNumber])),
    [policiesQuery.data],
  );

  const summaries: AgingBucketSummary[] = React.useMemo(() => {
    const rows = agingQuery.data ?? [];
    return AGING_BUCKET_ORDER.map((b) => {
      const inBucket = rows.filter((r) => r.agingBucket === b);
      return {
        bucket: b,
        count: inBucket.length,
        outstanding: inBucket.reduce((sum, r) => sum + Number(r.outstandingAmount), 0),
      };
    });
  }, [agingQuery.data]);

  const visibleRows = React.useMemo(() => {
    const rows = agingQuery.data ?? [];
    return bucket === ALL ? rows : rows.filter((r) => r.agingBucket === bucket);
  }, [agingQuery.data, bucket]);

  const totalOutstanding = summaries.reduce((sum, s) => sum + s.outstanding, 0);

  const columns = React.useMemo<ColumnDef<PremiumAgingRowDto>[]>(
    () => [
      {
        id: 'policy',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Policy" />,
        meta: { label: 'Policy' },
        accessorFn: (row) => policyNumberById.get(row.policyId) ?? row.policyId,
        cell: ({ row }) => (
          <Link href={`/policies/${row.original.policyId}`} className="font-medium text-primary hover:underline">
            {policyNumberById.get(row.original.policyId) ?? row.original.policyId.slice(0, 8)}
          </Link>
        ),
      },
      {
        accessorKey: 'dueDate',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Due date" />,
        meta: { label: 'Due date' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.dueDate)}</span>,
        sortingFn: (a, b) => new Date(a.original.dueDate).getTime() - new Date(b.original.dueDate).getTime(),
      },
      {
        accessorKey: 'daysOverdue',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Days overdue" />,
        meta: { label: 'Days overdue' },
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{row.original.daysOverdue > 0 ? row.original.daysOverdue : '—'}</div>
        ),
      },
      {
        accessorKey: 'agingBucket',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Bucket" />,
        meta: { label: 'Bucket' },
        cell: ({ row }) => (
          <Badge variant={row.original.agingBucket === 'CURRENT' ? 'success' : row.original.agingBucket === '90_PLUS' ? 'destructive' : 'warning'}>
            {agingBucketLabel(row.original.agingBucket)}
          </Badge>
        ),
      },
      {
        accessorKey: 'grossPremium',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Gross" />,
        meta: { label: 'Gross' },
        cell: ({ row }) => <div className="text-right tabular-nums">{formatNaira(row.original.grossPremium)}</div>,
        sortingFn: (a, b) => Number(a.original.grossPremium ?? 0) - Number(b.original.grossPremium ?? 0),
      },
      {
        accessorKey: 'paidAmount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Paid" />,
        meta: { label: 'Paid' },
        cell: ({ row }) => <div className="text-right tabular-nums">{formatNaira(row.original.paidAmount)}</div>,
        sortingFn: (a, b) => Number(a.original.paidAmount ?? 0) - Number(b.original.paidAmount ?? 0),
      },
      {
        accessorKey: 'outstandingAmount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Outstanding" />,
        meta: { label: 'Outstanding' },
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">{formatNaira(row.original.outstandingAmount)}</div>
        ),
        sortingFn: (a, b) => Number(a.original.outstandingAmount ?? 0) - Number(b.original.outstandingAmount ?? 0),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={premiumStatusVariant(row.original.status)}>{row.original.status.replace(/_/g, ' ')}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setRecording(row.original)}>
              Record payment
            </Button>
          </div>
        ),
      },
    ],
    [policyNumberById],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Premiums</h1>
        <p className="text-sm text-muted-foreground">Outstanding premium aging across the book — {formatNaira(totalOutstanding)} total outstanding.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aging summary</CardTitle>
          <CardDescription>Outstanding balance by days overdue.</CardDescription>
        </CardHeader>
        <CardContent>
          {agingQuery.isLoading ? <Skeleton className="h-56 w-full" /> : <AgingChart buckets={summaries} />}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={bucket}
          onValueChange={(value) => {
            setBucket(value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Aging bucket" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All buckets</SelectItem>
            {AGING_BUCKET_ORDER.map((b) => (
              <SelectItem key={b} value={b}>
                {agingBucketLabel(b)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<PremiumAgingRowDto, unknown>
        columns={columns}
        data={visibleRows}
        getRowId={(row) => row.premiumId}
        isLoading={agingQuery.isLoading}
        isError={agingQuery.isError}
        errorState={<span className="text-sm text-destructive">Couldn&apos;t load premium aging.</span>}
        rowSelection={rowSelection}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={<span className="text-sm text-muted-foreground">Nothing outstanding in this bucket.</span>}
        enableColumnVisibility
      />

      <RecordPaymentDialog
        premium={recording ? { id: recording.premiumId, dueDate: recording.dueDate, status: recording.status, grossPremium: recording.grossPremium, paidAmount: recording.paidAmount } : null}
        onOpenChange={(open) => !open && setRecording(null)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['premiums-aging'] })}
      />
    </div>
  );
}

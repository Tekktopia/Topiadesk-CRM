'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
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
  Input,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  selectionColumn,
  toast,
} from '@topiadesk/ui';
import { AGING_BUCKET_ORDER, agingBucketLabel, formatDate, formatNaira, premiumStatusVariant } from '@/app/(policy)/lib/format';
import type { PolicyDto, PremiumAgingRowDto } from '@/app/(policy)/lib/types';
import { useDebouncedValue } from '@/app/(policy)/lib/use-debounced-value';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { SelectionToolbar } from '../_components/selection-toolbar';
import { AgingChart, type AgingBucketSummary } from './aging-chart';
import { RecordPaymentDialog } from './record-payment-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

interface BulkActionResult {
  requested: string[];
  updated: string[];
  skipped: string[];
}

async function postBulk(url: string, body: unknown): Promise<BulkActionResult> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
  const parsed = (await res.json().catch(() => null)) as (BulkActionResult & { message?: string }) | null;
  if (!res.ok) throw new Error(parsed?.message ?? `${url} failed: ${res.status}`);
  if (!parsed) throw new Error(`${url} returned no body`);
  return parsed;
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
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [recording, setRecording] = React.useState<PremiumAgingRowDto | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [markPaidOpen, setMarkPaidOpen] = React.useState(false);
  const [markingPaid, setMarkingPaid] = React.useState(false);

  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  // Search matches by policy number (subquery against `policies`, since the
  // aging view has no policy_number column of its own — see
  // PremiumController.aging's comment).
  const agingQuery = useQuery({
    queryKey: ['premiums-aging', debouncedSearch],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (debouncedSearch) qs.set('search', debouncedSearch);
      const query = qs.toString();
      return fetchJson<PremiumAgingRowDto[]>(`/api/premiums/aging${query ? `?${query}` : ''}`);
    },
  });
  const policiesQuery = useQuery({
    queryKey: ['policies-lookup'],
    queryFn: () => fetchJson<PolicyDto[]>('/api/policies'),
    staleTime: 5 * 60_000,
  });

  async function markSelectedPaid() {
    setMarkingPaid(true);
    try {
      const result = await postBulk('/api/premiums/bulk/mark-paid', { ids: selectedIds });
      if (result.updated.length > 0) toast.success(`Marked ${result.updated.length} ${result.updated.length === 1 ? 'premium' : 'premiums'} as paid.`);
      if (result.skipped.length > 0) toast.error(`${result.skipped.length} ${result.skipped.length === 1 ? 'premium was' : 'premiums were'} skipped (outside scope).`);
      setRowSelection({});
      void queryClient.invalidateQueries({ queryKey: ['premiums-aging'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark premiums as paid');
    } finally {
      setMarkingPaid(false);
    }
  }

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
      selectionColumn<PremiumAgingRowDto>(),
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
        <Input
          placeholder="Search policy number…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          className="w-64"
        />
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

      <SelectionToolbar selectedCount={selectedIds.length} onClearSelection={() => setRowSelection({})}>
        <Button type="button" variant="outline" size="sm" onClick={() => setMarkPaidOpen(true)}>
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark as paid
        </Button>
      </SelectionToolbar>

      <DataTable<PremiumAgingRowDto, unknown>
        columns={columns}
        data={visibleRows}
        getRowId={(row) => row.premiumId}
        isLoading={agingQuery.isLoading}
        isError={agingQuery.isError}
        errorState={<span className="text-sm text-destructive">Couldn&apos;t load premium aging.</span>}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
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
      <ConfirmDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        title={`Mark ${selectedIds.length} ${selectedIds.length === 1 ? 'premium' : 'premiums'} as paid?`}
        description="Sets the paid amount to the full gross premium and the paid date to today — for reconciling a batch against a bank statement. Use Record payment on a single row for a partial amount."
        confirmLabel="Mark as paid"
        isPending={markingPaid}
        onConfirm={() => {
          setMarkPaidOpen(false);
          void markSelectedPaid();
        }}
      />
    </div>
  );
}

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
        <Select value={bucket} onValueChange={setBucket}>
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

      <Card>
        <CardContent className="p-0">
          {agingQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : agingQuery.isError ? (
            <p className="p-6 text-sm text-destructive">Couldn&apos;t load premium aging.</p>
          ) : visibleRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nothing outstanding in this bucket.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Days overdue</TableHead>
                  <TableHead>Bucket</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.premiumId}>
                    <TableCell>
                      <Link href={`/policies/${row.policyId}`} className="font-medium text-primary hover:underline">
                        {policyNumberById.get(row.policyId) ?? row.policyId.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(row.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.daysOverdue > 0 ? row.daysOverdue : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={row.agingBucket === 'CURRENT' ? 'success' : row.agingBucket === '90_PLUS' ? 'destructive' : 'warning'}>
                        {agingBucketLabel(row.agingBucket)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNaira(row.grossPremium)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNaira(row.paidAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatNaira(row.outstandingAmount)}</TableCell>
                    <TableCell>
                      <Badge variant={premiumStatusVariant(row.status)}>{row.status.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setRecording(row)}>
                        Record payment
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        premium={recording ? { id: recording.premiumId, dueDate: recording.dueDate, status: recording.status, grossPremium: recording.grossPremium, paidAmount: recording.paidAmount } : null}
        onOpenChange={(open) => !open && setRecording(null)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['premiums-aging'] })}
      />
    </div>
  );
}

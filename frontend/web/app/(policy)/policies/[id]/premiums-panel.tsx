'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@topiadesk/ui';
import { formatDate, formatNaira, premiumStatusVariant } from '@/app/(policy)/lib/format';
import type { PremiumDto } from '@/app/(policy)/lib/types';
import { RecordPaymentDialog } from '@/app/(policy)/premiums/record-payment-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function PremiumsPanel({ policyId }: { policyId: string }) {
  const queryClient = useQueryClient();
  const [recording, setRecording] = React.useState<PremiumDto | null>(null);
  const premiumsQuery = useQuery({
    queryKey: ['policy-premiums', policyId],
    queryFn: () => fetchJson<PremiumDto[]>(`/api/policies/${policyId}/premiums`),
  });

  if (premiumsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading premiums…</p>;
  if (premiumsQuery.isError || !premiumsQuery.data) return <p className="text-sm text-destructive">Couldn&apos;t load premiums.</p>;
  if (premiumsQuery.data.length === 0) return <p className="text-sm text-muted-foreground">No premiums recorded yet.</p>;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Due date</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead className="text-right">Commission</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Paid date</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {premiumsQuery.data.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="text-muted-foreground">{formatDate(p.dueDate)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNaira(p.grossPremium)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNaira(p.netPremium)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {p.commissionAmount ? formatNaira(p.commissionAmount) : '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNaira(p.paidAmount)}</TableCell>
              <TableCell>
                <Badge variant={premiumStatusVariant(p.status)}>{p.status.replace(/_/g, ' ')}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{p.paidDate ? formatDate(p.paidDate) : '—'}</TableCell>
              <TableCell>
                {p.status !== 'PAID' ? (
                  <Button size="sm" variant="outline" onClick={() => setRecording(p)}>
                    Record payment
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <RecordPaymentDialog
        premium={recording}
        onOpenChange={(open) => !open && setRecording(null)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['policy-premiums', policyId] })}
      />
    </>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
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
import { formatDate, formatNaira, policyStatusVariant } from '@/app/(policy)/lib/format';
import { POLICY_STATUSES, type LookupOption, type PolicyDto } from '@/app/(policy)/lib/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const ALL = 'ALL';

export function PoliciesView() {
  const [status, setStatus] = React.useState<string>(ALL);
  const [accountId, setAccountId] = React.useState<string>(ALL);

  const lookupsQuery = useQuery({
    queryKey: ['policy-lookups'],
    queryFn: () => fetchJson<{ accounts: LookupOption[]; carriers: LookupOption[] }>('/api/policy-lookups'),
    staleTime: 5 * 60_000,
  });

  const policiesQuery = useQuery({
    queryKey: ['policies', status, accountId],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (status !== ALL) qs.set('status', status);
      if (accountId !== ALL) qs.set('accountId', accountId);
      const query = qs.toString();
      return fetchJson<PolicyDto[]>(`/api/policies${query ? `?${query}` : ''}`);
    },
  });

  const accountNameById = React.useMemo(
    () => new Map((lookupsQuery.data?.accounts ?? []).map((a) => [a.id, a.name])),
    [lookupsQuery.data],
  );
  const carrierNameById = React.useMemo(
    () => new Map((lookupsQuery.data?.carriers ?? []).map((c) => [c.id, c.name])),
    [lookupsQuery.data],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Policies</h1>
        <p className="text-sm text-muted-foreground">Every bound, issued, and lapsed policy across the book.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {POLICY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {(lookupsQuery.data?.accounts ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {policiesQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : policiesQuery.isError ? (
            <p className="p-6 text-sm text-destructive">Couldn&apos;t load policies.</p>
          ) : policiesQuery.data && policiesQuery.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Line of business</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sum insured</TableHead>
                  <TableHead>Inception</TableHead>
                  <TableHead>Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policiesQuery.data.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell>
                      <Link href={`/policies/${policy.id}`} className="font-medium text-primary hover:underline">
                        {policy.policyNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{accountNameById.get(policy.accountId) ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{carrierNameById.get(policy.carrierId) ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{policy.lineOfBusiness}</TableCell>
                    <TableCell>
                      <Badge variant={policyStatusVariant(policy.status)}>{policy.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNaira(policy.sumInsured, policy.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(policy.inceptionDate)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(policy.expiryDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No policies match this filter.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

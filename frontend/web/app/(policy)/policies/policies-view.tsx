'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import {
  Badge,
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
} from '@topiadesk/ui';
import { formatDate, formatNaira, policyStatusVariant } from '@/app/(policy)/lib/format';
import { POLICY_STATUSES, type LookupOption, type PolicyDto } from '@/app/(policy)/lib/types';
import { CreatePolicyDialog } from './create-policy-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const ALL = 'ALL';

export function PoliciesView() {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<string>(ALL);
  const [accountId, setAccountId] = React.useState<string>(ALL);
  const [search, setSearch] = React.useState('');
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // Workaround for a bug in @topiadesk/ui's DataTable: unlike `sorting`/
  // `columnVisibility`, its internal `useReactTable` state has no fallback
  // for an omitted `rowSelection` (see data-table.tsx's `state:` block) —
  // passing neither `rowSelection` nor `onRowSelectionChange` (this page has
  // no bulk actions, so there's nothing to wire up) leaves TanStack's
  // rowSelection state literally `undefined`, and `row.getIsSelected()`
  // (called unconditionally per row for the `data-state` attribute) throws
  // trying to index into it. A stable empty object sidesteps the crash
  // without adding any selection UI (no selectionColumn in `columns`).
  const [rowSelection] = React.useState<RowSelectionState>({});

  /** Filter/search changes invalidate the current page — stay on page 1. */
  function resetToFirstPage() {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

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

  // Client-side filter over the already-fetched (status/account-scoped, <=100
  // row) list — no server-side search endpoint exists, and adding one is out
  // of scope here; this just narrows what's already in hand by policy number
  // or client name.
  const visiblePolicies = React.useMemo(() => {
    const rows = policiesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((policy) => {
      const accountName = accountNameById.get(policy.accountId) ?? '';
      return policy.policyNumber.toLowerCase().includes(q) || accountName.toLowerCase().includes(q);
    });
  }, [policiesQuery.data, search, accountNameById]);

  const columns = React.useMemo<ColumnDef<PolicyDto>[]>(
    () => [
      {
        accessorKey: 'policyNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Policy" />,
        meta: { label: 'Policy' },
        cell: ({ row }) => (
          <Link href={`/policies/${row.original.id}`} className="font-medium text-primary hover:underline">
            {row.original.policyNumber}
          </Link>
        ),
      },
      {
        id: 'account',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Account" />,
        meta: { label: 'Account' },
        accessorFn: (p) => accountNameById.get(p.accountId) ?? '—',
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'carrier',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Carrier" />,
        meta: { label: 'Carrier' },
        accessorFn: (p) => carrierNameById.get(p.carrierId) ?? '—',
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'lineOfBusiness',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Line of business" />,
        meta: { label: 'Line of business' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.lineOfBusiness}</span>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={policyStatusVariant(row.original.status)}>{row.original.status}</Badge>,
      },
      {
        accessorKey: 'sumInsured',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Sum insured" />,
        meta: { label: 'Sum insured' },
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{formatNaira(row.original.sumInsured, row.original.currency)}</div>
        ),
        sortingFn: (a, b) => Number(a.original.sumInsured ?? 0) - Number(b.original.sumInsured ?? 0),
      },
      {
        accessorKey: 'inceptionDate',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Inception" />,
        meta: { label: 'Inception' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.inceptionDate)}</span>,
        sortingFn: (a, b) => new Date(a.original.inceptionDate).getTime() - new Date(b.original.inceptionDate).getTime(),
      },
      {
        accessorKey: 'expiryDate',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Expiry" />,
        meta: { label: 'Expiry' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.expiryDate)}</span>,
        sortingFn: (a, b) => new Date(a.original.expiryDate).getTime() - new Date(b.original.expiryDate).getTime(),
      },
    ],
    [accountNameById, carrierNameById],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Policies</h1>
          <p className="text-sm text-muted-foreground">Every bound, issued, and lapsed policy across the book.</p>
        </div>
        <CreatePolicyDialog onCreated={() => queryClient.invalidateQueries({ queryKey: ['policies'] })} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search policy number or client…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetToFirstPage();
          }}
          className="w-64"
        />

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            resetToFirstPage();
          }}
        >
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

        <Select
          value={accountId}
          onValueChange={(value) => {
            setAccountId(value);
            resetToFirstPage();
          }}
        >
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

      <DataTable<PolicyDto, unknown>
        columns={columns}
        data={visiblePolicies}
        getRowId={(p) => p.id}
        isLoading={policiesQuery.isLoading}
        isError={policiesQuery.isError}
        errorState={<span className="text-sm text-destructive">Couldn&apos;t load policies.</span>}
        rowSelection={rowSelection}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" aria-hidden />
            <span className="text-sm text-muted-foreground">No policies match this filter.</span>
          </div>
        }
        enableColumnVisibility
      />
    </div>
  );
}

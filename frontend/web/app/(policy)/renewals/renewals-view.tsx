'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Download, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { useDebouncedValue } from '../lib/use-debounced-value';
import { formatDate } from '../lib/format';
import type { RenewalBoardQuery, RenewalBoardRow, RenewalBoardStats, RenewalStatus } from '../lib/types';
import { RenewalStatsStrip } from './_components/renewal-stats-strip';

const ALL = 'ALL';
const WINDOWS = [
  { value: '30', label: 'Next 30 days' },
  { value: '60', label: 'Next 60 days' },
  { value: '90', label: 'Next 90 days' },
  { value: '180', label: 'Next 6 months' },
  { value: '365', label: 'Next 12 months' },
];
const RENEWAL_STATUSES: RenewalStatus[] = ['ON_TRACK', 'AT_RISK', 'IN_PROGRESS', 'RENEWED', 'LAPSED', 'DECLINED_TO_RENEW'];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function buildQuery(q: RenewalBoardQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

function humanize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

/**
 * Urgency is expressed as a badge rather than a bare number because the
 * board is scanned, not read: "14d" and "-3d" look alike in a column of
 * digits, while red/amber/grey separates instantly. Already-expired rows are
 * the loudest thing on the page by design — they are money already lost, not
 * money at risk.
 */
function expiryBadge(days: number) {
  if (days < 0) return <Badge variant="destructive">{Math.abs(days)}d overdue</Badge>;
  if (days <= 30) return <Badge variant="destructive">{days}d</Badge>;
  if (days <= 60) return <Badge variant="secondary">{days}d</Badge>;
  return <Badge variant="outline">{days}d</Badge>;
}

/**
 * The org-wide renewal book.
 *
 * Renewals previously existed only inside one account or one policy at a
 * time, so there was no way to work the book: no list of what expires next,
 * who owns it, or what it is worth. For a brokerage, retention is the
 * revenue line, which makes this the workbench the policy module was missing.
 */
export function RenewalsView() {
  const [withinDays, setWithinDays] = React.useState('90');
  const [renewalStatus, setRenewalStatus] = React.useState(ALL);
  const [unassignedOnly, setUnassignedOnly] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<'expiryDate' | 'premium'>('expiryDate');
  const [search, setSearch] = React.useState('');
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const debouncedSearch = useDebouncedValue(search, 300);

  const query: RenewalBoardQuery = React.useMemo(
    () => ({
      withinDays: Number(withinDays),
      renewalStatus: renewalStatus === ALL ? undefined : (renewalStatus as RenewalStatus),
      // Omitted entirely when off — the API reads the param's presence, so
      // sending 'false' would still be a non-empty string.
      unassignedOnly: unassignedOnly ? 'true' : undefined,
      sortBy,
      q: debouncedSearch || undefined,
      take: 200,
    }),
    [withinDays, renewalStatus, unassignedOnly, sortBy, debouncedSearch],
  );

  const qs = buildQuery(query);
  const listQuery = useQuery({
    queryKey: ['renewals', query],
    queryFn: () => fetchJson<RenewalBoardRow[]>(`/api/renewals${qs}`),
  });
  const statsQuery = useQuery({
    queryKey: ['renewals', 'stats', query],
    queryFn: () => fetchJson<RenewalBoardStats>(`/api/renewals/stats${qs}`),
  });
  const countQuery = useQuery({
    queryKey: ['renewals', 'count', query],
    queryFn: () => fetchJson<{ count: number }>(`/api/renewals/count${qs}`),
  });

  // Stable reference — an inline `?? []` is a new array every render while
  // the query has no data, which drove DataTable's pagination into a render
  // loop. See packages/ui data-table.tsx.
  const rows = React.useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const realTotal = countQuery.data?.count ?? rows.length;
  const isTruncated = realTotal > rows.length;
  const hasFilters = renewalStatus !== ALL || unassignedOnly || Boolean(debouncedSearch) || withinDays !== '90';

  const columns = React.useMemo<ColumnDef<RenewalBoardRow>[]>(
    () => [
      {
        id: 'expiry',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Expires" />,
        meta: { label: 'Expires' },
        accessorFn: (r) => r.daysToExpiry,
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            {expiryBadge(row.original.daysToExpiry)}
            <span className="text-xs text-muted-foreground">{formatDate(row.original.expiryDate)}</span>
          </div>
        ),
      },
      {
        accessorKey: 'policyNumber',
        header: 'Policy',
        meta: { label: 'Policy' },
        enableSorting: false,
        cell: ({ row }) => (
          <Link href={`/policies/${row.original.policyId}`} className="font-medium text-foreground hover:underline">
            {row.original.policyNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'accountName',
        header: 'Client',
        meta: { label: 'Client' },
        enableSorting: false,
        cell: ({ row }) => (
          <Link href={`/accounts/${row.original.accountId}`} className="text-foreground hover:underline">
            {row.original.accountName}
          </Link>
        ),
      },
      {
        id: 'cover',
        header: 'Cover',
        meta: { label: 'Cover' },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col text-sm">
            <span className="text-foreground">{row.original.lineOfBusiness}</span>
            <span className="text-xs text-muted-foreground">{row.original.carrierName}</span>
          </div>
        ),
      },
      {
        id: 'renewalStatus',
        header: 'Renewal',
        meta: { label: 'Renewal' },
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          // "Not started" is a distinct, actionable state from any schedule
          // status — it means nobody has begun the renewal at all.
          if (r.scheduleMissing) return <Badge variant="outline">Not started</Badge>;
          if (r.renewalStatus === 'AT_RISK') return <Badge variant="destructive">At risk</Badge>;
          return <Badge variant="secondary">{humanize(r.renewalStatus ?? 'ON_TRACK')}</Badge>;
        },
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner' },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.assignedToName ? (
            <span className="text-foreground">{row.original.assignedToName}</span>
          ) : (
            <span className="text-destructive">Unassigned</span>
          ),
      },
      {
        id: 'premium',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Premium" />,
        meta: { label: 'Premium' },
        accessorFn: (r) => r.annualPremiumBase,
        cell: ({ row }) => (
          <span className="font-medium tabular-nums text-foreground">
            {new Intl.NumberFormat('en-NG', {
              style: 'currency',
              currency: row.original.baseCurrency,
              maximumFractionDigits: 0,
            }).format(row.original.annualPremiumBase)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Renewals</h1>
          <p className="text-sm text-muted-foreground">
            Every policy coming up for renewal across the book — what expires when, who owns it, and what it is worth.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            window.location.href = `/api/renewals/export${qs}`;
          }}
          disabled={rows.length === 0}
        >
          <Download aria-hidden /> Export
        </Button>
      </div>

      <RenewalStatsStrip stats={statsQuery.data} isLoading={statsQuery.isLoading} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Expiring within</label>
            <Select value={withinDays} onValueChange={(v) => { setWithinDays(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
              <SelectTrigger aria-label="Expiry window"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Renewal status</label>
            <Select value={renewalStatus} onValueChange={(v) => { setRenewalStatus(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
              <SelectTrigger aria-label="Filter by renewal status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                {RENEWAL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Sort by</label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'expiryDate' | 'premium')}>
              <SelectTrigger aria-label="Sort the board"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expiryDate">Soonest expiry</SelectItem>
                <SelectItem value="premium">Largest premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-56">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="renewal-search">Policy number</label>
            <Input
              id="renewal-search"
              placeholder="Search policy number…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            />
          </div>
          <Button
            variant={unassignedOnly ? 'default' : 'outline'}
            size="sm"
            aria-pressed={unassignedOnly}
            onClick={() => { setUnassignedOnly((v) => !v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
          >
            Unassigned only
          </Button>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setWithinDays('90');
                setRenewalStatus(ALL);
                setUnassignedOnly(false);
                setSearch('');
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            >
              <X aria-hidden /> Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isTruncated ? (
        <p className="text-sm text-muted-foreground">
          Showing the first {rows.length.toLocaleString()} of {realTotal.toLocaleString()} renewals — narrow the window to see the rest.
        </p>
      ) : null}

      <DataTable<RenewalBoardRow, unknown>
        columns={columns}
        data={rows}
        getRowId={(r) => r.policyId}
        isLoading={listQuery.isLoading}
        isError={listQuery.isError}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        pagination={pagination}
        onPaginationChange={setPagination}
        totalRowCount={realTotal}
        enableColumnVisibility
      />
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Target, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { StatsStrip } from '../../_components/stats-strip';
import { ACCOUNT_STATUSES } from '../../_lib/constants';
import { useCrossSell, useCrossSellStats } from '../../_lib/hooks';
import type { CrossSellQuery, CrossSellRow } from '../../_lib/types';

const UNSET = '__any';

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

/**
 * Cross-sell whitespace.
 *
 * Answers the question a brokerage CRM is expected to answer and this one
 * previously could not: which existing clients don't yet hold a line the
 * firm can place. The "not holding" filter is the point of the page — it
 * turns the table into a call list.
 *
 * The sellable universe comes from the carrier panel, not from what has
 * already been sold, so a line the firm has a market for but has never
 * placed still shows as opportunity rather than being invisible.
 */
export function CrossSellView() {
  const [missingLine, setMissingLine] = React.useState(UNSET);
  const [status, setStatus] = React.useState<string>('CLIENT');
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const query: CrossSellQuery = React.useMemo(
    () => ({
      missingLine: missingLine === UNSET ? undefined : missingLine,
      status: status === UNSET ? undefined : status,
      take: 500,
    }),
    [missingLine, status],
  );

  const { data: liveRows, isLoading, isError } = useCrossSell(query);
  // The gap table is driven by the UNFILTERED-by-line view: once you filter
  // to "missing Marine", every remaining row is missing Marine, so a gap
  // table computed from that would rank one line at 100% and hide the rest.
  const { data: stats, isLoading: statsLoading } = useCrossSellStats(
    React.useMemo(() => ({ status: status === UNSET ? undefined : status, take: 500 }), [status]),
  );

  const rows = React.useMemo(() => liveRows ?? [], [liveRows]);
  const hasFilters = missingLine !== UNSET || status !== 'CLIENT';

  const tiles = stats
    ? [
        {
          label: 'Clients analysed',
          value: stats.accounts.toLocaleString(),
          icon: <Target aria-hidden />,
          description: `${stats.accountsWithCover.toLocaleString()} hold at least one policy`,
        },
        {
          label: 'With a gap',
          value: stats.accountsWithGaps.toLocaleString(),
          icon: <Target aria-hidden />,
          description: 'Missing a line the firm can place',
        },
        {
          label: 'Biggest opportunity',
          value: stats.biggestGapLine ?? '—',
          icon: <Target aria-hidden />,
          description: stats.biggestGapLine ? `${stats.biggestGapCount.toLocaleString()} clients don't hold it` : 'No gaps found',
        },
        {
          label: 'Lines per client',
          value: stats.averageLinesPerAccount.toFixed(1),
          icon: <Target aria-hidden />,
          description: `of ${stats.linesAvailable.toLocaleString()} the firm can place`,
        },
      ]
    : [];

  const columns = React.useMemo<ColumnDef<CrossSellRow>[]>(
    () => [
      {
        accessorKey: 'accountName',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Client" />,
        meta: { label: 'Client' },
        cell: ({ row }) => (
          <Link href={`/accounts/${row.original.accountId}`} className="font-medium text-foreground hover:underline">
            {row.original.accountName}
          </Link>
        ),
      },
      {
        id: 'held',
        header: 'Holds',
        meta: { label: 'Holds' },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.linesHeld.length === 0 ? (
            <span className="text-muted-foreground">No cover placed</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.linesHeld.map((l) => (
                <Badge key={l} variant="secondary">{l}</Badge>
              ))}
            </div>
          ),
      },
      {
        id: 'missing',
        header: 'Whitespace',
        meta: { label: 'Whitespace' },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.linesMissing.slice(0, 6).map((l) => (
              <Badge key={l} variant="outline">{l}</Badge>
            ))}
            {row.original.linesMissing.length > 6 ? (
              <span className="text-xs text-muted-foreground">+{row.original.linesMissing.length - 6} more</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'gapCount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Gaps" />,
        meta: { label: 'Gaps' },
        accessorFn: (r) => r.linesMissing.length,
        cell: ({ row }) => <span className="tabular-nums text-foreground">{row.original.linesMissing.length}</span>,
      },
      {
        id: 'premium',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Current premium" />,
        meta: { label: 'Current premium' },
        accessorFn: (r) => r.premiumBase,
        cell: ({ row }) => (
          <span className="font-medium tabular-nums text-foreground">
            {money(row.original.premiumBase, row.original.baseCurrency)}
          </span>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        meta: { label: 'Owner' },
        enableSorting: false,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.ownerName ?? 'Unassigned'}</span>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cross-sell"
        description="Which clients don't yet hold a line the firm can place — the whitespace in the book."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              const qs = new URLSearchParams();
              if (query.missingLine) qs.set('missingLine', query.missingLine);
              if (query.status) qs.set('status', query.status);
              window.location.href = `/api/crm/cross-sell/export?${qs.toString()}`;
            }}
            disabled={rows.length === 0}
          >
            <Download aria-hidden /> Export call list
          </Button>
        }
      />

      <StatsStrip tiles={tiles} isLoading={statsLoading} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="w-full space-y-1.5 sm:w-56">
            <label className="text-xs font-medium text-muted-foreground">Not holding</label>
            <Select value={missingLine} onValueChange={(v) => { setMissingLine(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
              <SelectTrigger aria-label="Filter by missing line of business">
                <SelectValue placeholder="Any line" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any line</SelectItem>
                {(stats?.lines ?? []).map((l) => (
                  <SelectItem key={l.line} value={l.line}>
                    {l.line} ({l.accountsMissing})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Client status</label>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
              <SelectTrigger aria-label="Filter by account status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All accounts</SelectItem>
                {ACCOUNT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={() => { setMissingLine(UNSET); setStatus('CLIENT'); }}>
              <X aria-hidden /> Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where the gaps are</CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {(stats?.lines ?? []).map((l) => (
                <button
                  key={l.line}
                  type="button"
                  onClick={() => setMissingLine(l.line)}
                  className="rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-primary hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <span className="block text-sm font-medium text-foreground">{l.line}</span>
                  <span className="block text-xs text-muted-foreground">
                    {l.accountsMissing.toLocaleString()} missing · {l.accountsHolding.toLocaleString()} holding
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No clients match"
              description="Every client in this view already holds that line, or there are no accounts matching the status filter."
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<CrossSellRow, unknown>
          columns={columns}
          data={rows}
          getRowId={(r) => r.accountId}
          isLoading={isLoading}
          isError={isError}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={rows.length}
          enableColumnVisibility
        />
      )}
    </div>
  );
}

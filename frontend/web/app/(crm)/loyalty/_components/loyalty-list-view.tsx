'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Pencil, Search, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  type ColumnDef,
  DataTable,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { ChangeTierDialog } from '../../_components/change-tier-dialog';
import { EmptyState } from '../../_components/empty-state';
import { LoyaltyStatsStrip } from '../../_components/loyalty-stats-strip';
import { PageHeader } from '../../_components/page-header';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import { useLoyaltyAccounts, useLoyaltyStats } from '../../_lib/hooks';
import type { LoyaltyAccount } from '../../_lib/types';

const UNSET = '__any';

/**
 * Org-wide browse of every enrolled loyalty account — enrollment itself
 * happens from an Account's own detail page (Loyalty tab), not here; this
 * page is read-only, for a loyalty-program manager to see the whole book at
 * a glance and drill into any one account.
 */
export function LoyaltyListView() {
  const [search, setSearch] = React.useState('');
  const [tier, setTier] = React.useState<string>(UNSET);
  const debouncedSearch = useDebouncedValue(search, 300);
  const query = React.useMemo(
    () => ({ search: debouncedSearch || undefined, tier: tier === UNSET ? undefined : tier }),
    [debouncedSearch, tier],
  );
  const { data, isLoading, isError } = useLoyaltyAccounts(query);
  const { data: stats, isLoading: statsLoading } = useLoyaltyStats(query);
  // A SECOND, unfiltered stats read purely to populate the tier dropdown.
  // Sourcing the options from `stats` instead looks tempting and is a trap:
  // once a tier is picked, the filtered breakdown contains only that tier,
  // so the dropdown collapses to the current selection and there is no way
  // to switch tiers without clearing first. React Query caches this by its
  // own key, so it is one small aggregate, not a per-keystroke request.
  const { data: allStats } = useLoyaltyStats({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [tierTarget, setTierTarget] = React.useState<LoyaltyAccount | null>(null);

  // Stable reference: `x ?? []` mints a new array on every render while the
  // query has no data (i.e. right after a filter change), which is what drove
  // DataTable's pagination into a render loop. See data-table.tsx.
  const rows = React.useMemo(() => data ?? [], [data]);
  const hasActiveFilters = Boolean(debouncedSearch) || tier !== UNSET;

  // Tier is free text, so the options come from what tenants actually use
  // rather than a hardcoded enum that would be wrong for anyone who
  // invented their own.
  const tierOptions = allStats?.tierBreakdown.map((t) => t.tier) ?? [];

  function handleExport() {
    const qs = new URLSearchParams();
    if (query.search) qs.set('search', query.search);
    if (query.tier) qs.set('tier', query.tier);
    window.location.href = `/api/loyalty-accounts/export?${qs.toString()}`;
  }

  const columns = React.useMemo<ColumnDef<LoyaltyAccount>[]>(
    () => [
      {
        id: 'accountName',
        header: 'Account',
        meta: { label: 'Account' },
        accessorFn: (r) => r.accountName ?? '',
        cell: ({ row }) => (
          <Link href={`/accounts/${row.original.accountId}`} className="font-medium text-foreground hover:underline">
            {row.original.accountName}
          </Link>
        ),
      },
      {
        accessorKey: 'tier',
        header: 'Tier',
        meta: { label: 'Tier' },
        cell: ({ row }) => <Badge variant="secondary">{row.original.tier}</Badge>,
      },
      {
        accessorKey: 'pointsBalance',
        header: 'Points balance',
        meta: { label: 'Points balance' },
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.pointsBalance.toLocaleString()}</span>,
      },
      {
        accessorKey: 'enrolledAt',
        header: 'Enrolled',
        meta: { label: 'Enrolled' },
        cell: ({ row }) => <span className="text-muted-foreground">{new Date(row.original.enrolledAt).toLocaleDateString()}</span>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableHiding: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" aria-label={`Change tier for ${row.original.accountName ?? row.original.id}`} onClick={() => setTierTarget(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loyalty"
        description="Points balances and tiers across every enrolled account."
        actions={
          <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
            <Download aria-hidden /> Export
          </Button>
        }
      />

      <LoyaltyStatsStrip stats={stats} isLoading={statsLoading} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input placeholder="Search accounts…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger className="w-44" aria-label="Filter by tier">
              <SelectValue placeholder="All tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>All tiers</SelectItem>
              {tierOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setTier(UNSET);
              }}
            >
              <X aria-hidden /> Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title={hasActiveFilters ? 'No members match these filters' : 'No accounts enrolled yet'}
              description={
                hasActiveFilters
                  ? 'Try a different tier or clear the search.'
                  : 'Enroll an account in the loyalty program from its Account detail page.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<LoyaltyAccount, unknown>
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={isLoading}
          isError={isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={rows.length}
        />
      )}

      {tierTarget ? (
        <ChangeTierDialog
          open={!!tierTarget}
          onOpenChange={(open) => !open && setTierTarget(null)}
          loyaltyAccountId={tierTarget.id}
          accountId={tierTarget.accountId}
          currentTier={tierTarget.tier}
        />
      ) : null}
    </div>
  );
}

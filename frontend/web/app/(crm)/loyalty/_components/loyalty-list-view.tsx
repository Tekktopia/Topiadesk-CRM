'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Badge, Card, CardContent, type ColumnDef, DataTable, Input } from '@topiadesk/ui';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import { useLoyaltyAccounts } from '../../_lib/hooks';
import type { LoyaltyAccount } from '../../_lib/types';

/**
 * Org-wide browse of every enrolled loyalty account — enrollment itself
 * happens from an Account's own detail page (Loyalty tab), not here; this
 * page is read-only, for a loyalty-program manager to see the whole book at
 * a glance and drill into any one account.
 */
export function LoyaltyListView() {
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isLoading, isError } = useLoyaltyAccounts(debouncedSearch || undefined);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const rows = data ?? [];

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
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Loyalty" description="Points balances and tiers across every enrolled account." />

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input placeholder="Search accounts…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
        </CardContent>
      </Card>

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No accounts enrolled yet"
              description="Enroll an account in the loyalty program from its Account detail page."
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
    </div>
  );
}

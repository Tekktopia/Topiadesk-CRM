'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Badge, type ColumnDef, DataTable, DataTableColumnHeader } from '@topiadesk/ui';
import { PageHeader } from '../../_components/page-header';
import { apiFetch } from '../../_lib/api';
import type { KycAccountDto, KycUrgency } from '../../_lib/types';

const URGENCY_LABEL: Record<KycUrgency, string> = {
  EXPIRED: 'Expired',
  NOT_VERIFIED: 'Not verified',
  EXPIRING_SOON: 'Expiring soon',
};

const URGENCY_VARIANT: Record<KycUrgency, 'destructive' | 'warning' | 'secondary'> = {
  EXPIRED: 'destructive',
  NOT_VERIFIED: 'warning',
  EXPIRING_SOON: 'secondary',
};

const TAKE = 50;

export default function KycTrackingPage() {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: TAKE });

  const kycQuery = useQuery({
    queryKey: ['compliance', 'kyc', pagination.pageIndex],
    queryFn: () => apiFetch<KycAccountDto[]>(`/api/crm/compliance/kyc?take=${TAKE}&skip=${pagination.pageIndex * TAKE}`),
  });

  const accounts = kycQuery.data ?? [];

  const columns = useMemo<ColumnDef<KycAccountDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Account" />,
        cell: ({ row }) => (
          <Link href={`/accounts/${row.original.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'urgency',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => <Badge variant={URGENCY_VARIANT[row.original.urgency]}>{URGENCY_LABEL[row.original.urgency]}</Badge>,
      },
      {
        accessorKey: 'kycStatus',
        header: 'KYC status',
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.kycStatus}</span>,
      },
      {
        accessorKey: 'kycExpiryDate',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Expiry" />,
        cell: ({ row }) =>
          row.original.kycExpiryDate ? (
            <span className="whitespace-nowrap text-sm text-muted-foreground">{new Date(row.original.kycExpiryDate).toLocaleDateString()}</span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/accounts/${row.original.id}`}
            className="flex items-center justify-end gap-1 text-sm font-medium text-primary hover:underline"
          >
            Review <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="KYC Tracking"
        description="Accounts needing KYC attention — expired or unverified first, then verified accounts expiring within 30 days. Verifying KYC happens on each account's own page."
      />

      {accounts.length === 0 && !kycQuery.isLoading ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">Nothing needs attention</p>
          <p className="max-w-sm text-sm text-muted-foreground">Every account is either verified with plenty of runway, or has no KYC requirement yet.</p>
        </div>
      ) : (
        <DataTable<KycAccountDto, unknown>
          columns={columns}
          data={accounts}
          getRowId={(a) => a.id}
          isLoading={kycQuery.isLoading}
          isError={kycQuery.isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={pagination.pageIndex * TAKE + accounts.length + (accounts.length === TAKE ? 1 : 0)}
        />
      )}
    </div>
  );
}

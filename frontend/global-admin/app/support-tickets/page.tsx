'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  DataTable,
  DataTableColumnHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
  type PaginationState,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { PlatformSupportTicket, SupportTicketStatus, Tenant } from '../_lib/types';
import { TicketPriorityBadge, TicketStatusBadge } from './_badges';
import { PageHeader } from '../_components/page-header';

const STATUS_FILTERS: Array<SupportTicketStatus | 'ALL'> = ['ALL', 'OPEN', 'IN_PROGRESS', 'WAITING_ON_TENANT', 'RESOLVED', 'CLOSED'];
const ALL_TENANTS = '__all__';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 1) return `${hours}h ago`;
  return 'just now';
}

export default function SupportTicketsPage() {
  return (
    <React.Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <SupportTicketsPageContent />
    </React.Suspense>
  );
}

function SupportTicketsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') ?? ALL_TENANTS;
  const status = (searchParams.get('status') as SupportTicketStatus | null) ?? 'ALL';
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const setFilter = React.useCallback(
    (key: 'tenantId' | 'status', value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === ALL_TENANTS || value === 'ALL') params.delete(key);
      else params.set(key, value);
      router.push(`/support-tickets${params.toString() ? `?${params.toString()}` : ''}`);
    },
    [router, searchParams],
  );

  const { data: tenants } = useQuery({ queryKey: ['tenants'], queryFn: () => apiFetch<Tenant[]>('/api/tenants') });

  const qs = React.useMemo(() => {
    const params = new URLSearchParams();
    if (tenantId !== ALL_TENANTS) params.set('tenantId', tenantId);
    if (status !== 'ALL') params.set('status', status);
    return params.toString();
  }, [tenantId, status]);

  const { data, isLoading } = useQuery({
    queryKey: ['support-tickets', qs],
    queryFn: () => apiFetch<PlatformSupportTicket[]>(`/api/support-tickets${qs ? `?${qs}` : ''}`),
  });

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [qs]);

  const columns = React.useMemo<ColumnDef<PlatformSupportTicket>[]>(
    () => [
      {
        accessorKey: 'subject',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Subject" />,
        cell: ({ row }) => (
          <Link href={`/support-tickets/${row.original.id}`} className="font-medium hover:underline">
            {row.original.subject}
          </Link>
        ),
      },
      { accessorKey: 'tenantName', header: ({ column }) => <DataTableColumnHeader column={column} label="Tenant" /> },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => <TicketStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Priority" />,
        cell: ({ row }) => <TicketPriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: 'assignedToName',
        header: 'Assigned to',
        cell: ({ row }) => row.original.assignedToName ?? <span className="text-muted-foreground">Unassigned</span>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Age" />,
        cell: ({ row }) => <span className="text-muted-foreground">{timeAgo(row.original.createdAt)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Support Tickets" description="Requests raised by tenant admins across every customer organization." />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={tenantId} onValueChange={(v) => setFilter('tenantId', v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All tenants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TENANTS}>All tenants</SelectItem>
            {tenants?.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setFilter('status', v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : s.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        getRowId={(t) => t.id}
        isLoading={isLoading}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={<p className="text-muted-foreground">No support tickets match your filters.</p>}
      />
    </div>
  );
}

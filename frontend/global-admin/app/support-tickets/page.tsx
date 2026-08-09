'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DataTable, DataTableColumnHeader, type ColumnDef } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { PlatformSupportTicket } from '../_lib/types';
import { TicketPriorityBadge, TicketStatusBadge } from './_badges';
import { PageHeader } from '../_components/page-header';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 1) return `${hours}h ago`;
  return 'just now';
}

export default function SupportTicketsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => apiFetch<PlatformSupportTicket[]>('/api/support-tickets'),
  });

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
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title="Support Tickets" description="Requests raised by tenant admins across every customer organization." />

      <DataTable columns={columns} data={data ?? []} getRowId={(t) => t.id} isLoading={isLoading} emptyState={<p className="text-muted-foreground">No support tickets yet.</p>} />
    </div>
  );
}

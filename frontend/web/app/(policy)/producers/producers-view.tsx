'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type ColumnDef,
  toast,
} from '@topiadesk/ui';
import { producerStatusVariant, producerTypeLabel } from '@/app/(policy)/lib/format';
import type { ProducerDto, UserOption } from '@/app/(policy)/lib/types';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { ProducerFormDialog } from './_components/producer-form-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Flat roster of every commission-earning producer — internal brokers,
 * external sub-brokers, correspondents. The parent/child hierarchy is
 * visible per-producer on its detail page (same "flat list here, tree on
 * detail" split as DepartmentTree does inline instead — producers can run
 * to hundreds of rows across a brokerage, unlike the handful of
 * departments, so a page-wide tree isn't the right default view).
 */
export function ProducersView() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProducerDto | null>(null);
  const [deleting, setDeleting] = React.useState<ProducerDto | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const producersQuery = useQuery({ queryKey: ['producers'], queryFn: () => fetchJson<ProducerDto[]>('/api/producers') });
  const usersQuery = useQuery({
    queryKey: ['identity-users'],
    queryFn: () => fetchJson<UserOption[]>('/api/identity-users'),
    staleTime: 5 * 60_000,
  });

  const producers = React.useMemo(() => producersQuery.data ?? [], [producersQuery.data]);
  const users = React.useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const producerById = React.useMemo(() => new Map(producers.map((p) => [p.id, p])), [producers]);
  const userById = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const deleteProducer = useMutation({
    mutationFn: (id: string) => fetch(`/api/producers/${id}`, { method: 'DELETE', credentials: 'same-origin' }),
    onSuccess: () => {
      toast.success('Producer deleted');
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      setDeleting(null);
    },
    onError: () => toast.error('Failed to delete producer'),
  });

  const columns = React.useMemo<ColumnDef<ProducerDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => (
          <Link href={`/producers/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'producerCode',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Code" />,
        meta: { label: 'Code' },
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.producerCode}</span>,
      },
      {
        id: 'type',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Type" />,
        meta: { label: 'Type' },
        accessorFn: (p) => producerTypeLabel(p.type),
        cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge>,
      },
      {
        id: 'parent',
        header: 'Reports to',
        meta: { label: 'Reports to' },
        accessorFn: (p) => (p.parentProducerId ? (producerById.get(p.parentProducerId)?.name ?? p.parentProducerId) : '—'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'linkedUser',
        header: 'Linked user',
        meta: { label: 'Linked user' },
        accessorFn: (p) => (p.linkedUserId ? (userById.get(p.linkedUserId)?.fullName ?? '—') : '—'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={producerStatusVariant(row.original.status)}>{row.original.status}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Producer actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [producerById, userById],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Producers</h1>
          <p className="text-sm text-muted-foreground">
            Brokers, sub-brokers, and correspondents who earn commission — including external parties with no TopiaDesk login.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden /> New producer
        </Button>
      </div>

      <DataTable<ProducerDto, unknown>
        columns={columns}
        data={producers}
        getRowId={(p) => p.id}
        isLoading={producersQuery.isLoading}
        isError={producersQuery.isError}
        errorState={<span className="text-sm text-destructive">Couldn&apos;t load producers.</span>}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={<span className="text-sm text-muted-foreground">No producers yet.</span>}
        enableColumnVisibility
      />

      <ProducerFormDialog open={createOpen} onOpenChange={setCreateOpen} producers={producers} users={users} />
      {editing ? (
        <ProducerFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          producer={editing}
          producers={producers}
          users={users}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the producer. Any sub-producers reporting to them and any commission-split assignments referencing them should be reassigned first."
        confirmLabel="Delete producer"
        destructive
        isPending={deleteProducer.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteProducer.mutate(deleting.id);
        }}
      />
    </div>
  );
}

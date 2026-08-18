'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDollarSign, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { formatDate, formatNaira, producerCommissionStatusVariant } from '@/app/(policy)/lib/format';
import { PRODUCER_COMMISSION_STATUSES, type ProducerCommissionDto, type ProducerDto } from '@/app/(policy)/lib/types';
import { ProducerCommissionFormDialog } from './_components/producer-commission-form-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const ALL = 'ALL';

/** Filterable list of ProducerCommission records with the PENDING -> APPROVED -> PAID status move inline per row. */
export function ProducerCommissionsView() {
  const queryClient = useQueryClient();
  const [producerFilter, setProducerFilter] = React.useState(ALL);
  const [statusFilter, setStatusFilter] = React.useState(ALL);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const producersQuery = useQuery({ queryKey: ['producers'], queryFn: () => fetchJson<ProducerDto[]>('/api/producers') });
  const producers = React.useMemo(() => producersQuery.data ?? [], [producersQuery.data]);
  const producerById = React.useMemo(() => new Map(producers.map((p) => [p.id, p])), [producers]);

  const commissionsQuery = useQuery({
    queryKey: ['producer-commissions', { producerId: producerFilter, status: statusFilter }],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (producerFilter !== ALL) qs.set('producerId', producerFilter);
      if (statusFilter !== ALL) qs.set('status', statusFilter);
      const query = qs.toString();
      return fetchJson<ProducerCommissionDto[]>(`/api/producer-commissions${query ? `?${query}` : ''}`);
    },
  });

  // Stable reference: `x ?? []` mints a new array on every render while the
  // query has no data (i.e. right after a filter change), which is what drove
  // DataTable's pagination into a render loop. See data-table.tsx.
  const commissions = React.useMemo(() => commissionsQuery.data ?? [], [commissionsQuery.data]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, paymentDate }: { id: string; status: string; paymentDate?: string }) => {
      const res = await fetch(`/api/producer-commissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status, paymentDate }),
      });
      if (!res.ok) throw new Error('Failed to update commission');
    },
    onSuccess: () => {
      toast.success('Commission updated');
      queryClient.invalidateQueries({ queryKey: ['producer-commissions'] });
    },
    onError: () => toast.error('Failed to update commission'),
  });

  const columns = React.useMemo<ColumnDef<ProducerCommissionDto>[]>(
    () => [
      {
        accessorKey: 'commissionNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Commission #" />,
        meta: { label: 'Commission #' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.commissionNumber}</span>,
      },
      {
        id: 'producer',
        header: 'Producer',
        meta: { label: 'Producer' },
        accessorFn: (c) => producerById.get(c.producerId)?.name ?? c.producerId,
        cell: ({ row }) => (
          <Link href={`/producers/${row.original.producerId}`} className="text-primary hover:underline">
            {producerById.get(row.original.producerId)?.name ?? row.original.producerId.slice(0, 8)}
          </Link>
        ),
      },
      {
        id: 'policy',
        header: 'Policy',
        meta: { label: 'Policy' },
        cell: ({ row }) => (
          <Link href={`/policies/${row.original.policyId}`} className="text-muted-foreground hover:underline">
            {row.original.policyId.slice(0, 8)}
          </Link>
        ),
      },
      {
        accessorKey: 'period',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Period" />,
        meta: { label: 'Period' },
      },
      {
        accessorKey: 'commissionAmount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Commission" />,
        meta: { label: 'Commission' },
        cell: ({ row }) => <div className="text-right tabular-nums">{formatNaira(row.original.commissionAmount)}</div>,
      },
      {
        accessorKey: 'netPayable',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Net payable" />,
        meta: { label: 'Net payable' },
        cell: ({ row }) => <div className="text-right font-medium tabular-nums">{formatNaira(row.original.netPayable)}</div>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={producerCommissionStatusVariant(row.original.status)}>{row.original.status}</Badge>,
      },
      {
        accessorKey: 'paymentDate',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Payment date" />,
        meta: { label: 'Payment date' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.paymentDate ? formatDate(row.original.paymentDate) : '—'}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {row.original.status === 'PENDING' ? (
              <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: row.original.id, status: 'APPROVED' })}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Approve
              </Button>
            ) : null}
            {row.original.status === 'APPROVED' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus.mutate({ id: row.original.id, status: 'PAID', paymentDate: new Date().toISOString().slice(0, 10) })}
              >
                <CircleDollarSign className="h-3.5 w-3.5" aria-hidden /> Mark paid
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [producerById, updateStatus],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Producer commissions</h1>
          <p className="text-sm text-muted-foreground">What every producer is owed, by policy — PENDING → APPROVED → PAID.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden /> New commission
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={producerFilter}
          onValueChange={(v) => {
            setProducerFilter(v);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Producer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All producers</SelectItem>
            {producers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {PRODUCER_COMMISSION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<ProducerCommissionDto, unknown>
        columns={columns}
        data={commissions}
        getRowId={(c) => c.id}
        isLoading={commissionsQuery.isLoading}
        isError={commissionsQuery.isError}
        errorState={<span className="text-sm text-destructive">Couldn&apos;t load producer commissions.</span>}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={<span className="text-sm text-muted-foreground">No commission records match these filters.</span>}
        enableColumnVisibility
      />

      <ProducerCommissionFormDialog open={createOpen} onOpenChange={setCreateOpen} producers={producers} />
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserCog, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
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
  selectionColumn,
  toast,
} from '@topiadesk/ui';
import { formatDate, formatNaira, policyStatusVariant } from '@/app/(policy)/lib/format';
import { POLICY_STATUSES, type LookupOption, type PolicyDto } from '@/app/(policy)/lib/types';
import { useDebouncedValue } from '@/app/(policy)/lib/use-debounced-value';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { SelectionToolbar } from '../_components/selection-toolbar';
import { CreatePolicyDialog } from './create-policy-dialog';
import { ReassignBrokerDialog } from './reassign-broker-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

interface BulkActionResult {
  requested: string[];
  updated: string[];
  skipped: string[];
}

async function postBulk(url: string, body: unknown): Promise<BulkActionResult> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
  const parsed = (await res.json().catch(() => null)) as (BulkActionResult & { message?: string }) | null;
  if (!res.ok) throw new Error(parsed?.message ?? `${url} failed: ${res.status}`);
  if (!parsed) throw new Error(`${url} returned no body`);
  return parsed;
}

function reportBulkResult(verb: string, { updated, skipped }: BulkActionResult): void {
  if (updated.length > 0) toast.success(`${verb} ${updated.length} ${updated.length === 1 ? 'policy' : 'policies'}.`);
  if (skipped.length > 0) toast.error(`${skipped.length} ${skipped.length === 1 ? 'policy was' : 'policies were'} skipped (outside scope or an invalid status transition).`);
}

const ALL = 'ALL';

export function PoliciesView() {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<string>(ALL);
  const [accountId, setAccountId] = React.useState<string>(ALL);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reassigning, setReassigning] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  /** Filter/search changes invalidate the current page — stay on page 1. */
  function resetToFirstPage() {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const lookupsQuery = useQuery({
    queryKey: ['policy-lookups'],
    queryFn: () => fetchJson<{ accounts: LookupOption[]; carriers: LookupOption[] }>('/api/policy-lookups'),
    staleTime: 5 * 60_000,
  });

  // Server-side search on policyNumber (PolicyController.list's `q` param) —
  // replaces the old client-only filter now that a real search endpoint
  // exists; deliberately policy-number-only (not client name too, which
  // would need a join this endpoint doesn't do) — see the search input's
  // placeholder below.
  const policiesQuery = useQuery({
    queryKey: ['policies', status, accountId, debouncedSearch],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (status !== ALL) qs.set('status', status);
      if (accountId !== ALL) qs.set('accountId', accountId);
      if (debouncedSearch) qs.set('q', debouncedSearch);
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

  const visiblePolicies = policiesQuery.data ?? [];

  async function reassignBroker(brokerOfRecordId: string) {
    setReassigning(true);
    try {
      const result = await postBulk('/api/policies/bulk/assign', { ids: selectedIds, brokerOfRecordId });
      reportBulkResult('Reassigned', result);
      setRowSelection({});
      void queryClient.invalidateQueries({ queryKey: ['policies'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reassign broker of record');
    } finally {
      setReassigning(false);
    }
  }

  async function cancelSelected() {
    setCancelling(true);
    try {
      const result = await postBulk('/api/policies/bulk/update', { ids: selectedIds, status: 'CANCELLED' });
      reportBulkResult('Cancelled', result);
      setRowSelection({});
      void queryClient.invalidateQueries({ queryKey: ['policies'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel policies');
    } finally {
      setCancelling(false);
    }
  }

  const columns = React.useMemo<ColumnDef<PolicyDto>[]>(
    () => [
      selectionColumn<PolicyDto>(),
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
          placeholder="Search policy number…"
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

      <SelectionToolbar selectedCount={selectedIds.length} onClearSelection={() => setRowSelection({})}>
        <Button type="button" variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
          <UserCog className="h-4 w-4" aria-hidden /> Reassign broker
        </Button>
        <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
          <XCircle className="h-4 w-4" aria-hidden /> Cancel
        </Button>
      </SelectionToolbar>

      <DataTable<PolicyDto, unknown>
        columns={columns}
        data={visiblePolicies}
        getRowId={(p) => p.id}
        isLoading={policiesQuery.isLoading}
        isError={policiesQuery.isError}
        errorState={<span className="text-sm text-destructive">Couldn&apos;t load policies.</span>}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
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

      <ReassignBrokerDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        isPending={reassigning}
        onConfirm={(brokerOfRecordId) => {
          setReassignOpen(false);
          void reassignBroker(brokerOfRecordId);
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${selectedIds.length} ${selectedIds.length === 1 ? 'policy' : 'policies'}?`}
        description="Policies already CANCELLED, or LAPSED, can't reach CANCELLED and will be reported as skipped rather than changed."
        confirmLabel="Cancel policies"
        destructive
        isPending={cancelling}
        onConfirm={() => {
          setCancelOpen(false);
          void cancelSelected();
        }}
      />
    </div>
  );
}

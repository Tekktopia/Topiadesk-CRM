'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { CARRIER_PANEL_STATUSES, CARRIER_TYPES, carrierPanelStatusLabel, carrierPanelStatusVariant, carrierTypeLabel } from '../../_lib/constants';
import { useCarrierStats, useCarriers, useCarriersCount, useDeleteCarrier } from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { Carrier, CarrierQuery } from '../../_lib/types';
import { CarrierFormDialog } from './carrier-form-dialog';
import { CarrierStatsStrip } from './carrier-stats-strip';

const UNSET = '__any';

export function CarriersListView() {
  const [search, setSearch] = React.useState('');
  const [carrierType, setCarrierType] = React.useState<string>(UNSET);
  const [panelStatus, setPanelStatus] = React.useState<string>(UNSET);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query: CarrierQuery = {
    q: debouncedSearch || undefined,
    carrierType: carrierType === UNSET ? undefined : (carrierType as CarrierQuery['carrierType']),
    panelStatus: panelStatus === UNSET ? undefined : (panelStatus as CarrierQuery['panelStatus']),
  };

  const { data, isLoading, isError } = useCarriers(query);
  const { data: countData } = useCarriersCount(query);
  const { data: stats, isLoading: statsLoading } = useCarrierStats(query);
  const deleteCarrier = useDeleteCarrier();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Carrier | null>(null);
  const [deleting, setDeleting] = React.useState<Carrier | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // No bulk actions on this page (no selection column in `columns` below), but
  // DataTable's row.getIsSelected() is called unconditionally per row — it
  // throws if `rowSelection` state is left undefined instead of `{}`. See
  // packages/ui/src/composite/data-table.tsx: unlike `sorting`/`columnVisibility`,
  // the `rowSelection` state has no internal-state fallback when the prop is
  // omitted.
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // Stable reference: `x ?? []` mints a new array on every render while the
  // query has no data (i.e. right after a filter change), which is what drove
  // DataTable's pagination into a render loop. See data-table.tsx.
  const rows = React.useMemo(() => data ?? [], [data]);
  const realTotal = countData?.count ?? rows.length;
  const isTruncated = realTotal > rows.length;
  const hasActiveFilters = Boolean(debouncedSearch) || carrierType !== UNSET || panelStatus !== UNSET;

  function clearFilters() {
    setSearch('');
    setCarrierType(UNSET);
    setPanelStatus(UNSET);
  }

  function handleExport() {
    const qs = new URLSearchParams();
    if (query.q) qs.set('q', query.q);
    if (query.carrierType) qs.set('carrierType', query.carrierType);
    if (query.panelStatus) qs.set('panelStatus', query.panelStatus);
    window.location.href = `/api/crm/carriers/export?${qs.toString()}`;
  }

  const columns = React.useMemo<ColumnDef<Carrier>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => (
          <Link href={`/carriers/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'type',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Type" />,
        meta: { label: 'Type' },
        accessorFn: (c) => carrierTypeLabel(c.carrierType),
        cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge>,
      },
      {
        accessorKey: 'amBestRating',
        header: ({ column }) => <DataTableColumnHeader column={column} label="A.M. Best" />,
        meta: { label: 'A.M. Best' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.amBestRating ?? '—'}</span>,
      },
      {
        id: 'linesOfBusiness',
        header: 'Lines of business',
        meta: { label: 'Lines of business' },
        enableSorting: false,
        accessorFn: (c) => (c.linesOfBusiness.length > 0 ? c.linesOfBusiness.join(', ') : '—'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'panelStatus',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Panel status" />,
        meta: { label: 'Panel status' },
        cell: ({ row }) =>
          row.original.panelStatus ? (
            <Badge variant={carrierPanelStatusVariant(row.original.panelStatus)}>{carrierPanelStatusLabel(row.original.panelStatus)}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Carrier actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Carriers"
        description="Insurers and reinsurers on your placement panel."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New carrier
          </Button>
        }
      />

      <CarrierStatsStrip stats={stats} isLoading={statsLoading} />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 lg:flex-row lg:items-end">
          <div className="w-full space-y-1.5 lg:max-w-xs">
            <label htmlFor="carrier-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="carrier-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, A.M. Best rating, treaty"
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={carrierType} onValueChange={setCarrierType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All types</SelectItem>
                {CARRIER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {carrierTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Panel status</label>
            <Select value={panelStatus} onValueChange={setPanelStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any status</SelectItem>
                {CARRIER_PANEL_STATUSES.map((ps) => (
                  <SelectItem key={ps} value={ps}>
                    {carrierPanelStatusLabel(ps)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 sm:mb-0.5">
            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
                <X className="h-3.5 w-3.5" aria-hidden /> Clear
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0} className="gap-1.5">
              <Download className="h-3.5 w-3.5" aria-hidden /> Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {isTruncated ? (
        <p className="text-sm text-muted-foreground">
          Showing the first {rows.length.toLocaleString()} of {realTotal.toLocaleString()} matching carriers — narrow the
          filters, or use Export for the full set.
        </p>
      ) : null}

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title={hasActiveFilters ? 'No carriers match these filters' : 'No carriers yet'}
              description="Add insurers and reinsurers to shop opportunities to them."
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New carrier
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Carrier, unknown>
          columns={columns}
          data={rows}
          getRowId={(c) => c.id}
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

      <CarrierFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? (
        <CarrierFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} carrier={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the carrier. This cannot be undone."
        confirmLabel="Delete carrier"
        destructive
        isPending={deleteCarrier.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteCarrier.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

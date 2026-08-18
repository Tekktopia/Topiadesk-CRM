'use client';

import * as React from 'react';
import { Download, MoreHorizontal, Plus, Search, X } from 'lucide-react';
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
  Tabs,
  TabsList,
  TabsTrigger,
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { CustomFieldStatsStrip } from '../../_components/custom-field-stats-strip';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { CUSTOM_FIELD_ENTITY_TYPES, humanize } from '../../_lib/constants';
import { useCustomFieldDefinitions, useCustomFieldDefinitionStats, useDeactivateCustomFieldDefinition } from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { CustomFieldDefinition, CustomFieldEntityType } from '../../_lib/types';
import { CustomFieldFormDialog } from './custom-field-form-dialog';

const UNSET = '__any';

export function CustomFieldsView() {
  const [entityType, setEntityType] = React.useState<CustomFieldEntityType>('ACCOUNT');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CustomFieldDefinition | null>(null);
  const [deactivating, setDeactivating] = React.useState<CustomFieldDefinition | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  // No bulk actions here (no selection column below), but DataTable's
  // row.getIsSelected() is called unconditionally per row and throws if
  // `rowSelection` state is left undefined instead of `{}` — see the same
  // note in carriers-list-view.tsx.
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<string>(UNSET);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = React.useMemo(
    () => ({
      entityType,
      q: debouncedSearch || undefined,
      isActive: status === UNSET ? undefined : status,
    }),
    [entityType, debouncedSearch, status],
  );

  const { data, isLoading, isError } = useCustomFieldDefinitions(query);
  // Deliberately unfiltered by entityType: the strip's job is to describe
  // the whole custom schema (which record types are extended, how many
  // fields users are forced to fill) — scoping it to the open tab would make
  // "Entities extended" always read 1.
  const { data: stats, isLoading: statsLoading } = useCustomFieldDefinitionStats({});
  const deactivate = useDeactivateCustomFieldDefinition();

  // Memoized for the same reason as opportunities-table-view's `filtered`:
  // .slice().sort() is a new array on every render.
  const rows = React.useMemo(() => (data ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder), [data]);
  const hasActiveFilters = Boolean(debouncedSearch) || status !== UNSET;

  function handleExport() {
    const qs = new URLSearchParams();
    if (query.entityType) qs.set('entityType', query.entityType);
    if (query.q) qs.set('q', query.q);
    if (query.isActive) qs.set('isActive', query.isActive);
    window.location.href = `/api/crm/custom-field-definitions/export?${qs.toString()}`;
  }

  const columns = React.useMemo<ColumnDef<CustomFieldDefinition>[]>(
    () => [
      {
        accessorKey: 'label',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Label" />,
        meta: { label: 'Label' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.label}</span>,
      },
      {
        accessorKey: 'key',
        header: 'Key',
        meta: { label: 'Key' },
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.key}</span>,
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        enableSorting: false,
        accessorFn: (d) => humanize(d.fieldType),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'required',
        header: 'Required',
        meta: { label: 'Required' },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.isRequired ? <Badge variant="secondary">Required</Badge> : <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'outline'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        accessorKey: 'displayOrder',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Order" />,
        meta: { label: 'Order' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.displayOrder}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Custom field actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              {row.original.isActive ? (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeactivating(row.original)}>
                  Deactivate
                </DropdownMenuItem>
              ) : null}
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
        title="Custom Fields"
        description="Extra fields rendered on the Account, Contact, Lead, and Opportunity create/edit forms, stored per record in a jsonb column."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
              <Download aria-hidden /> Export
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New field
            </Button>
          </div>
        }
      />

      <CustomFieldStatsStrip stats={stats} isLoading={statsLoading} />

      <Tabs value={entityType} onValueChange={(v) => setEntityType(v as CustomFieldEntityType)}>
        <TabsList>
          {CUSTOM_FIELD_ENTITY_TYPES.map((t) => (
            <TabsTrigger key={t} value={t}>
              {humanize(t)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input placeholder="Search label or key…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>All statuses</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Deactivated</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatus(UNSET);
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
              title={hasActiveFilters ? 'No fields match these filters' : `No custom fields for ${humanize(entityType)} yet`}
              description={
                hasActiveFilters
                  ? 'Try a different search or status.'
                  : 'Add one to start capturing entity-specific data on the create/edit form.'
              }
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New field
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<CustomFieldDefinition, unknown>
          columns={columns}
          data={rows}
          getRowId={(d) => d.id}
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

      <CustomFieldFormDialog open={createOpen} onOpenChange={setCreateOpen} defaultEntityType={entityType} />
      {editing ? (
        <CustomFieldFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} definition={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deactivating)}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Deactivate "${deactivating?.label}"?`}
        description="It stops rendering on create/edit forms, but any values already saved under it are kept. This can be re-activated later by editing the field."
        confirmLabel="Deactivate"
        destructive
        isPending={deactivate.isPending}
        onConfirm={() => {
          if (!deactivating) return;
          deactivate.mutate(deactivating.id, { onSuccess: () => setDeactivating(null) });
        }}
      />
    </div>
  );
}

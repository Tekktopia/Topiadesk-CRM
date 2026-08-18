'use client';

import * as React from 'react';
import { MoreHorizontal, Plus, Users, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@topiadesk/ui';
import { useCan } from '@/app/(cases)/_lib/hooks';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { StatsStrip } from '../../_components/stats-strip';
import {
  useCreateTerritory,
  useDeactivateTerritory,
  useDirectoryUsers,
  useTerritories,
  useTerritoryStats,
  useUpdateTerritory,
} from '../../_lib/hooks';
import type { Territory, TerritoryQuery, TerritoryType } from '../../_lib/types';

const UNSET = '__any';
const NONE = '__none';
const TERRITORY_TYPES: TerritoryType[] = ['GEOGRAPHIC', 'INDUSTRY', 'PRODUCT', 'NAMED_ACCOUNTS'];

function humanize(v: string): string {
  return v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');
}

/**
 * Books of business.
 *
 * Ownership already lived on each account, and a whole book could already be
 * handed over. What this adds is the structure: a named book with a manager,
 * the producers working it, and a hierarchy so a branch rolls up into a
 * region — so a book survives the person who happens to own it today.
 */
export function TerritoriesView() {
  const canWrite = useCan('territory', 'write');
  const [search, setSearch] = React.useState('');
  const [type, setType] = React.useState(UNSET);
  const [showRetired, setShowRetired] = React.useState(false);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Territory | null>(null);
  const [retiring, setRetiring] = React.useState<Territory | null>(null);

  const query: TerritoryQuery = React.useMemo(
    () => ({
      q: search || undefined,
      type: type === UNSET ? undefined : (type as TerritoryType),
      // Omitted entirely when showing everything — sending 'false' would
      // filter to retired only.
      isActive: showRetired ? undefined : 'true',
      take: 300,
    }),
    [search, type, showRetired],
  );

  const { data, isLoading, isError } = useTerritories(query);
  const { data: stats, isLoading: statsLoading } = useTerritoryStats(query);
  const { usersById } = useDirectoryUsers();
  const deactivate = useDeactivateTerritory();

  const rows = React.useMemo(() => data ?? [], [data]);
  const hasFilters = Boolean(search) || type !== UNSET || showRetired;

  const tiles = stats
    ? [
        {
          label: 'Books',
          value: stats.active.toLocaleString(),
          icon: <Users aria-hidden />,
          description: `${stats.total.toLocaleString()} defined in total`,
        },
        {
          label: 'Clients placed',
          value: stats.assignedAccounts.toLocaleString(),
          icon: <Users aria-hidden />,
          description: 'Sitting in a named book',
        },
        {
          label: "In nobody's book",
          value: stats.unassignedAccounts.toLocaleString(),
          icon: <Users aria-hidden />,
          description: stats.unassignedAccounts > 0 ? 'At risk of going unserviced' : 'Every client is placed',
        },
        {
          label: 'Books with no team',
          value: stats.withoutMembers.toLocaleString(),
          icon: <Users aria-hidden />,
          description: stats.withoutMembers > 0 ? 'Nobody assigned to work them' : 'Every book has producers',
        },
      ]
    : [];

  const columns = React.useMemo<ColumnDef<Territory>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Book" />,
        meta: { label: 'Book' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.original.name}</span>
            {row.original.parentName ? (
              <span className="text-xs text-muted-foreground">part of {row.original.parentName}</span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        enableSorting: false,
        cell: ({ row }) => <Badge variant="outline">{humanize(row.original.type)}</Badge>,
      },
      {
        id: 'manager',
        header: 'Manager',
        meta: { label: 'Manager' },
        enableSorting: false,
        cell: ({ row }) => <span className="text-foreground">{row.original.managerName ?? '—'}</span>,
      },
      {
        id: 'team',
        header: 'Producers',
        meta: { label: 'Producers' },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.members.length === 0 ? (
            <Badge variant="destructive">Nobody assigned</Badge>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.members.slice(0, 3).map((m) => (
                <Badge key={m.userId} variant="secondary">{m.fullName ?? 'Unknown'}</Badge>
              ))}
              {row.original.members.length > 3 ? (
                <span className="text-xs text-muted-foreground">+{row.original.members.length - 3}</span>
              ) : null}
            </div>
          ),
      },
      {
        accessorKey: 'accountCount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Clients" />,
        meta: { label: 'Clients' },
        cell: ({ row }) => <span className="tabular-nums text-foreground">{row.original.accountCount.toLocaleString()}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Retired</Badge>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => {
          if (!canWrite) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${row.original.name}`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { setEditing(row.original); setFormOpen(true); }}>Edit</DropdownMenuItem>
                {row.original.isActive ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setRetiring(row.original)}
                  >
                    Retire
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [canWrite],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Territories"
        description="Named books of business — who leads each one, who works it, and which clients sit in it."
        actions={
          canWrite ? (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus aria-hidden /> New book
            </Button>
          ) : undefined
        }
      />

      <StatsStrip tiles={tiles} isLoading={statsLoading} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="w-full space-y-1.5 sm:w-64">
            <Label htmlFor="territory-search" className="text-xs text-muted-foreground">Search</Label>
            <Input
              id="territory-search"
              placeholder="Book name…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={(v) => { setType(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}>
              <SelectTrigger aria-label="Filter by territory type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All types</SelectItem>
                {TERRITORY_TYPES.map((t) => <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant={showRetired ? 'default' : 'outline'}
            size="sm"
            aria-pressed={showRetired}
            onClick={() => setShowRetired((v) => !v)}
          >
            Include retired
          </Button>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setType(UNSET); setShowRetired(false); }}>
              <X aria-hidden /> Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title={hasFilters ? 'No books match these filters' : 'No territories defined yet'}
              description={
                hasFilters
                  ? 'Try a different name or type.'
                  : 'Create a book to group clients by region, industry, product or named account — so a portfolio survives whoever happens to own it today.'
              }
              action={
                canWrite ? (
                  <Button variant="outline" onClick={() => { setEditing(null); setFormOpen(true); }}>
                    <Plus aria-hidden /> New book
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Territory, unknown>
          columns={columns}
          data={rows}
          getRowId={(t) => t.id}
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

      <TerritoryFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }}
        territory={editing}
        territories={rows}
        users={[...usersById.values()]}
      />

      <ConfirmDialog
        open={Boolean(retiring)}
        onOpenChange={(open) => !open && setRetiring(null)}
        title={`Retire "${retiring?.name}"?`}
        description="The book stops appearing in active lists, but its clients keep pointing at it so historical reporting stays readable. It can be re-activated by editing it."
        confirmLabel="Retire"
        destructive
        isPending={deactivate.isPending}
        onConfirm={() => {
          if (!retiring) return;
          deactivate.mutate(retiring.id, { onSuccess: () => setRetiring(null) });
        }}
      />
    </div>
  );
}

function TerritoryFormDialog({
  open,
  onOpenChange,
  territory,
  territories,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  territory: Territory | null;
  territories: Territory[];
  users: { id: string; fullName: string }[];
}) {
  const create = useCreateTerritory();
  const update = useUpdateTerritory();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [type, setType] = React.useState<TerritoryType>('GEOGRAPHIC');
  const [parentId, setParentId] = React.useState(NONE);
  const [managerId, setManagerId] = React.useState(NONE);
  const [memberIds, setMemberIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    setName(territory?.name ?? '');
    setDescription(territory?.description ?? '');
    setType(territory?.type ?? 'GEOGRAPHIC');
    setParentId(territory?.parentId ?? NONE);
    setManagerId(territory?.managerId ?? NONE);
    setMemberIds(territory?.members.map((m) => m.userId) ?? []);
  }, [territory, open]);

  const isPending = create.isPending || update.isPending;

  function submit() {
    const payload = {
      name,
      description: description || undefined,
      type,
      parentId: parentId === NONE ? undefined : parentId,
      managerId: managerId === NONE ? undefined : managerId,
      memberIds,
    };
    if (territory) {
      update.mutate({ id: territory.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{territory ? 'Edit book' : 'New book of business'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="territory-name">Name</Label>
            <Input id="territory-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lagos Corporate" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="territory-desc">Description</Label>
            <Textarea id="territory-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as TerritoryType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TERRITORY_TYPES.map((t) => <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Part of</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder="Top level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Top level</SelectItem>
                {territories
                  // A book can't be its own parent; deeper loops are refused
                  // by the API's cycle guard.
                  .filter((t) => t.id !== territory?.id)
                  .map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Manager</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Producers</Label>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-input p-2">
              {users.map((u) => {
                const on = memberIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMemberIds((prev) => (on ? prev.filter((x) => x !== u.id) : [...prev, u.id]))}
                    className={
                      on
                        ? 'rounded-full bg-primary px-2.5 py-1 text-xs text-primary-foreground'
                        : 'rounded-full border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted'
                    }
                  >
                    {u.fullName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={submit} disabled={isPending || name.trim().length === 0}>
            {isPending ? 'Saving…' : territory ? 'Save changes' : 'Create book'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

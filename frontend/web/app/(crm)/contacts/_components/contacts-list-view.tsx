'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Mail, MoreHorizontal, Phone, Star, Trash2, UserRoundX, Users, X } from 'lucide-react';
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
  selectionColumn,
} from '@topiadesk/ui';
import { useCan } from '@/app/(cases)/_lib/hooks';
import { AccountCombobox } from '../../_components/account-combobox';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { ContactStatsStrip } from '../../_components/contact-stats-strip';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { formatDate } from '../../_lib/format';
import {
  useAccountsLookup,
  useBulkDeleteContacts,
  useBulkAssignContacts,
  useContactStats,
  useContacts,
  useContactsCount,
} from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { Contact, ContactQuery } from '../../_lib/types';

const UNSET = '__any';
const FETCH_CAP = 100;

/**
 * The firm-wide contact book.
 *
 * Contacts previously existed only as a tab inside a single account, so
 * there was no way to search everyone the firm knows, segment them, or act
 * on more than one at a time — the API had supported all of it from the
 * start with no screen attached. For a brokerage, whose business is
 * relationships, that was the largest gap in the CRM.
 *
 * A contact belongs to EITHER an account or a carrier, never both
 * (contacts_exactly_one_parent), which is why the parent column can show a
 * carrier and why bulk "move to account" skips carrier-linked rows rather
 * than silently corrupting them.
 */
export function ContactsListView() {
  const canWrite = useCan('contact', 'write');
  const [search, setSearch] = React.useState('');
  const [account, setAccount] = React.useState<{ id: string; name: string } | null>(null);
  const [primaryOnly, setPrimaryOnly] = React.useState<string>(UNSET);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [moveTarget, setMoveTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query: ContactQuery = React.useMemo(
    () => ({
      q: debouncedSearch || undefined,
      accountId: account?.id,
      // Sent as the literal string 'true'/'false' — see ContactQueryDto for
      // why boolean query flags are modelled as strings here.
      isPrimary: primaryOnly === UNSET ? undefined : primaryOnly,
      take: FETCH_CAP,
    }),
    [debouncedSearch, account?.id, primaryOnly],
  );

  const { data: liveData, isLoading, isError } = useContacts(query);
  const { data: countData } = useContactsCount(query);
  const { data: stats, isLoading: statsLoading } = useContactStats(query);
  const { accountsById } = useAccountsLookup();
  const bulkAssign = useBulkAssignContacts();
  const bulkDelete = useBulkDeleteContacts();

  // Stable reference — an inline `?? []` is a new array every render while
  // the query has no data, which drove DataTable's pagination into a render
  // loop. See packages/ui data-table.tsx.
  const rows = React.useMemo(() => liveData ?? [], [liveData]);
  const realTotal = countData?.count ?? rows.length;
  const isTruncated = realTotal > rows.length;
  const hasActiveFilters = Boolean(debouncedSearch) || Boolean(account) || primaryOnly !== UNSET;

  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  function resetFilters() {
    setSearch('');
    setAccount(null);
    setPrimaryOnly(UNSET);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function handleExport() {
    const qs = new URLSearchParams();
    if (query.q) qs.set('q', query.q);
    if (query.accountId) qs.set('accountId', query.accountId);
    if (query.isPrimary) qs.set('isPrimary', query.isPrimary);
    window.location.href = `/api/crm/contacts/export?${qs.toString()}`;
  }

  const columns = React.useMemo<ColumnDef<Contact>[]>(
    () => [
      selectionColumn<Contact>(),
      {
        id: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        accessorFn: (c) => `${c.firstName} ${c.lastName}`.trim(),
        cell: ({ row }) => {
          const c = row.original;
          const name = `${c.firstName} ${c.lastName}`.trim();
          // An erased contact has no account to navigate to in any useful
          // sense — its PII is gone by design — so it renders as plain text.
          if (c.anonymizedAt) {
            return (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <UserRoundX className="h-3.5 w-3.5" aria-hidden /> {name}
              </span>
            );
          }
          return c.accountId ? (
            <Link href={`/accounts/${c.accountId}`} className="font-medium text-foreground hover:underline">
              {name}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{name}</span>
          );
        },
      },
      {
        accessorKey: 'title',
        header: 'Job title',
        meta: { label: 'Job title' },
        enableSorting: false,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.title ?? '—'}</span>,
      },
      {
        id: 'parent',
        header: 'Belongs to',
        meta: { label: 'Belongs to' },
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          if (c.accountId) {
            return (
              <Link href={`/accounts/${c.accountId}`} className="text-foreground hover:underline">
                {accountsById.get(c.accountId)?.name ?? 'Account'}
              </Link>
            );
          }
          if (c.carrierId) {
            return (
              <Link href={`/carriers/${c.carrierId}`} className="text-muted-foreground hover:underline">
                Carrier contact
              </Link>
            );
          }
          return <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'reach',
        header: 'Contactable by',
        meta: { label: 'Contactable by' },
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          if (!c.email && !c.phone) {
            return <Badge variant="outline">No email or phone</Badge>;
          }
          return (
            <div className="flex flex-col gap-0.5 text-sm">
              {c.email ? (
                <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-foreground hover:underline">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {c.email}
                </a>
              ) : null}
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:underline">
                  <Phone className="h-3.5 w-3.5" aria-hidden /> {c.phone}
                </a>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: 'isPrimary',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Primary" />,
        meta: { label: 'Primary' },
        cell: ({ row }) =>
          row.original.isPrimary ? (
            <Badge variant="secondary" className="gap-1">
              <Star className="h-3 w-3" aria-hidden /> Primary
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Added" />,
        meta: { label: 'Added' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${row.original.firstName} ${row.original.lastName}`}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.original.accountId ? (
                <DropdownMenuItem asChild>
                  <Link href={`/accounts/${row.original.accountId}`}>Open account</Link>
                </DropdownMenuItem>
              ) : null}
              {row.original.email ? (
                <DropdownMenuItem asChild>
                  <a href={`mailto:${row.original.email}`}>Send email</a>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [accountsById],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Every person the firm knows, across all client accounts and carriers."
        actions={
          <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
            <Download aria-hidden /> Export
          </Button>
        }
      />

      <ContactStatsStrip stats={stats} isLoading={statsLoading} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="w-full space-y-1.5 sm:w-72">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="contact-search">
              Search
            </label>
            <Input
              id="contact-search"
              placeholder="Name, email, phone or job title…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-64">
            <label className="text-xs font-medium text-muted-foreground">Account</label>
            <AccountCombobox
              value={account}
              onChange={(next) => {
                setAccount(next);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
              placeholder="Any account"
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Primary</label>
            <Select
              value={primaryOnly}
              onValueChange={(v) => {
                setPrimaryOnly(v);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            >
              <SelectTrigger aria-label="Filter by primary contact">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All contacts</SelectItem>
                <SelectItem value="true">Primary only</SelectItem>
                <SelectItem value="false">Non-primary only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X aria-hidden /> Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isTruncated ? (
        <p className="text-sm text-muted-foreground">
          Showing the first {rows.length.toLocaleString()} of {realTotal.toLocaleString()} matching contacts — narrow the filters to see the rest.
        </p>
      ) : null}

      {canWrite && selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
          <p className="text-sm font-medium text-foreground">{selectedIds.length} selected</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
              <Users className="h-4 w-4" aria-hidden /> Move to account
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRowSelection({})}>
              <X className="h-4 w-4" aria-hidden /> Clear
            </Button>
          </div>
        </div>
      ) : null}

      {!isLoading && !isError && rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title={hasActiveFilters ? 'No contacts match these filters' : 'No contacts yet'}
              description={
                hasActiveFilters
                  ? 'Try a different search, account, or clear the filters.'
                  : 'Contacts are added from an account’s Contacts tab, or arrive with an imported client list.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Contact, unknown>
          columns={columns}
          data={rows}
          getRowId={(c) => c.id}
          isLoading={isLoading}
          isError={isError}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={realTotal}
          enableColumnVisibility
        />
      )}

      <ConfirmDialog
        open={moveOpen}
        onOpenChange={(open) => {
          setMoveOpen(open);
          if (!open) setMoveTarget(null);
        }}
        title={`Move ${selectedIds.length} contact(s) to another account?`}
        description={
          <div className="space-y-3">
            <p>
              The selected contacts will be re-parented to the account you pick. Contacts that belong to a carrier are skipped — a
              contact has exactly one parent.
            </p>
            <AccountCombobox value={moveTarget} onChange={setMoveTarget} placeholder="Choose the destination account…" />
          </div>
        }
        confirmLabel="Move contacts"
        isPending={bulkAssign.isPending}
        onConfirm={() => {
          if (!moveTarget) return;
          bulkAssign.mutate(
            { ids: selectedIds, accountId: moveTarget.id },
            {
              onSuccess: () => {
                setMoveOpen(false);
                setMoveTarget(null);
                setRowSelection({});
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${selectedIds.length} contact(s)?`}
        description="This permanently removes them. To honour an erasure request instead, use a data subject request — that anonymises the contact while preserving their case and policy history."
        confirmLabel="Delete"
        destructive
        isPending={bulkDelete.isPending}
        onConfirm={() =>
          bulkDelete.mutate(
            { ids: selectedIds },
            {
              onSuccess: () => {
                setDeleteOpen(false);
                setRowSelection({});
              },
            },
          )
        }
      />
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRightLeft, CopyX, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  selectionColumn,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { useQuickCreateParam } from '@/lib/use-quick-create-param';
import { BulkActionToolbar } from '../../_components/bulk-action-toolbar';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { SavedViewBar } from '../../_components/saved-view-bar';
import { LEAD_STATUSES, leadStatusLabel, leadStatusVariant } from '../../_lib/constants';
import { formatDate, fullName } from '../../_lib/format';
import { useBulkAssignLeads, useBulkDeleteLeads, useDeleteLead, useLeads, useLeadSources } from '../../_lib/hooks';
import type { FilterTree, Lead, LeadQuery } from '../../_lib/types';
import { LeadConvertDialog } from './lead-convert-dialog';
import { LeadFormDialog } from './lead-form-dialog';

const UNSET = '__any';

function scoreVariant(score: number): 'success' | 'secondary' | 'outline' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'secondary';
  return 'outline';
}

export function LeadsListView() {
  const { user } = useCurrentUser();
  const [status, setStatus] = React.useState<string>(UNSET);
  const [source, setSource] = React.useState<string>(UNSET);
  const [mineOnly, setMineOnly] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Lead | null>(null);
  const [deleting, setDeleting] = React.useState<Lead | null>(null);
  const [converting, setConverting] = React.useState<Lead | null>(null);
  // Non-null while a saved view is applied — see accounts-list-view.tsx for the same pattern.
  const [savedViewRows, setSavedViewRows] = React.useState<Lead[] | null>(null);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  useQuickCreateParam(() => setCreateOpen(true));

  const query: LeadQuery = {
    status: status === UNSET ? undefined : (status as LeadQuery['status']),
    source: source === UNSET ? undefined : (source as LeadQuery['source']),
    assignedToId: mineOnly && user ? user.id : undefined,
  };

  const { data: liveData, isLoading, isError } = useLeads(query);
  const { data: leadSourcesData } = useLeadSources();
  const leadSources = leadSourcesData ?? [];
  const sourceNameByCode = React.useMemo(() => new Map(leadSources.map((s) => [s.code, s.name])), [leadSources]);
  const data = savedViewRows ?? liveData ?? [];
  const deleteLead = useDeleteLead();
  const bulkAssign = useBulkAssignLeads();
  const bulkDelete = useBulkDeleteLeads();

  function withViewReset<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      setSavedViewRows(null);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
      setter(value);
    };
  }

  // Current filter controls -> saved-view-filters.ts's LEAD allowlist shape.
  function buildFilters(): FilterTree {
    const conditions: FilterTree['conditions'] = [];
    if (status !== UNSET) conditions.push({ field: 'status', operator: 'eq', value: status });
    if (source !== UNSET) conditions.push({ field: 'source', operator: 'eq', value: source });
    if (mineOnly && user) conditions.push({ field: 'assignedToId', operator: 'eq', value: user.id });
    return { op: 'AND', conditions };
  }

  const selectedIds = React.useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  const columns = React.useMemo<ColumnDef<Lead>[]>(
    () => [
      selectionColumn<Lead>(),
      {
        id: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        accessorFn: (l) => fullName(l.firstName, l.lastName),
        cell: ({ row }) => (
          <Link href={`/leads/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {fullName(row.original.firstName, row.original.lastName)}
          </Link>
        ),
      },
      {
        id: 'company',
        header: 'Company',
        meta: { label: 'Company' },
        accessorFn: (l) => l.companyName ?? '—',
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'source',
        header: 'Source',
        meta: { label: 'Source' },
        accessorFn: (l) => sourceNameByCode.get(l.source) ?? l.source,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'score',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Score" />,
        meta: { label: 'Score' },
        cell: ({ row }) => <Badge variant={scoreVariant(row.original.score)}>{row.original.score}</Badge>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        meta: { label: 'Status' },
        cell: ({ row }) => <Badge variant={leadStatusVariant(row.original.status)}>{leadStatusLabel(row.original.status)}</Badge>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        meta: { label: 'Created' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
        sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Lead actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.original.status !== 'CONVERTED' ? (
                <DropdownMenuItem onSelect={() => setConverting(row.original)}>
                  <ArrowRightLeft aria-hidden /> Convert
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [sourceNameByCode],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Inbound prospects, scored and ready to qualify."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/duplicates?entity=LEAD">
                <CopyX aria-hidden /> Find duplicates
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New lead
            </Button>
          </>
        }
      />

      <SavedViewBar<Lead> entityType="LEAD" buildFilters={buildFilters} onApply={setSavedViewRows} />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-end">
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={withViewReset(setStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All statuses</SelectItem>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {leadStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Source</label>
            <Select value={source} onValueChange={withViewReset(setSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>All sources</SelectItem>
                {leadSources.map((s) => (
                  <SelectItem key={s.id} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={mineOnly}
              onChange={(e) => withViewReset(setMineOnly)(e.target.checked)}
              disabled={!user}
            />
            My leads only
          </label>
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedIds.length}
        onClearSelection={() => setRowSelection({})}
        reassignLabel="Reassign to"
        onReassign={(assignedToId) =>
          bulkAssign.mutate({ ids: selectedIds, assignedToId }, { onSuccess: () => setRowSelection({}) })
        }
        isReassigning={bulkAssign.isPending}
        onDelete={() => bulkDelete.mutate({ ids: selectedIds }, { onSuccess: () => setRowSelection({}) })}
        isDeleting={bulkDelete.isPending}
        entityNamePlural="leads"
      />

      {!isLoading && !isError && data.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No leads match these filters"
              action={
                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden /> New lead
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<Lead, unknown>
          columns={columns}
          data={data}
          getRowId={(l) => l.id}
          isLoading={isLoading}
          isError={isError}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={data.length}
          enableColumnVisibility
        />
      )}

      <LeadFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? <LeadFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} lead={editing} /> : null}
      {converting ? (
        <LeadConvertDialog open={Boolean(converting)} onOpenChange={(open) => !open && setConverting(null)} lead={converting} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete lead "${deleting ? fullName(deleting.firstName, deleting.lastName) : ''}"?`}
        description="This permanently removes the lead. This cannot be undone."
        confirmLabel="Delete lead"
        destructive
        isPending={deleteLead.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteLead.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

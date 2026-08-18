'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  type ColumnDef,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type RowSelectionState,
  selectionColumn,
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState } from './query-states';
import { ConfirmDialog } from './confirm-dialog';
import { AdminBulkActionToolbar } from './admin-bulk-action-toolbar';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { AutomationRuleDto, AutomationTriggerType } from '../_lib/types';
import { AutomationRuleBuilder } from './automation-rule-builder';
import { describeRuleConditions, describeRuleActions, describeRuleSchedule } from '../_lib/automation-describe';

/**
 * Shared list view reused by /admin/triggers (ENTITY_EVENT) and
 * /admin/automations (SCHEDULE). Zendesk treats real-time "Triggers" and
 * time-based "Automations" as two distinct admin pages even though both
 * are the same underlying rule concept — AutomationRule.triggerType is
 * exactly that split (see backend/api/src/modules/crm/
 * automation-rules.controller.ts). One component parameterized by
 * triggerType + page copy avoids duplicating the CRUD wiring twice.
 */
export function AutomationRulesListView({
  triggerType,
  title,
  description,
  emptyTitle,
  emptyDescription,
  newLabel,
}: {
  triggerType: AutomationTriggerType;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  newLabel: string;
}) {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const [dialogTarget, setDialogTarget] = useState<'create' | AutomationRuleDto | null>(null);
  const [deleting, setDeleting] = useState<AutomationRuleDto | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const queryKey = ['admin', 'automation-rules', triggerType];

  const rulesQuery = useQuery({
    queryKey,
    queryFn: () => apiFetch<AutomationRuleDto[]>(`/api/crm/automation-rules?triggerType=${triggerType}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crm/automation-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Rule deleted');
      queryClient.invalidateQueries({ queryKey });
      setDeleting(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete rule'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => apiFetch<void>(`/api/crm/automation-rules/${id}`, { method: 'DELETE' }))),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} rule${ids.length === 1 ? '' : 's'} deleted`);
      queryClient.invalidateQueries({ queryKey });
      setRowSelection({});
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete rules'),
  });
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const rules = rulesQuery.data ?? [];

  const columns = useMemo<ColumnDef<AutomationRuleDto>[]>(() => {
    const cols: ColumnDef<AutomationRuleDto>[] = [
      selectionColumn<AutomationRuleDto>(),
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        id: 'conditions',
        header: 'Applies to',
        enableSorting: false,
        // Was a raw JSON.stringify of the conditions blob. Nobody can scan a
        // list of those to find the rule they mean.
        cell: ({ row }) => (
          <span className="block max-w-xs truncate text-xs text-muted-foreground">{describeRuleConditions(row.original)}</span>
        ),
      },
      {
        id: 'actionsSpec',
        header: 'Does',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-xs truncate text-xs text-muted-foreground">{describeRuleActions(row.original)}</span>
        ),
      },
      {
        id: 'schedule',
        header: 'When',
        enableSorting: false,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{describeRuleSchedule(row.original)}</span>,
      },
      {
        id: 'lastRun',
        header: 'Last run',
        enableSorting: false,
        // The observability that did not exist: a rule silently failing every
        // night looked identical to one working perfectly.
        cell: ({ row }) => {
          const { lastRunAt, lastRunStatus, lastMatchCount, lastRunError } = row.original;
          if (!lastRunAt) return <span className="text-xs text-muted-foreground">Not yet run</span>;
          return (
            <div className="flex flex-col gap-0.5">
              <Badge variant={lastRunStatus === 'OK' ? 'success' : lastRunStatus === 'FAILED' ? 'destructive' : 'secondary'}>
                {lastRunStatus === 'OK' ? `${lastMatchCount ?? 0} matched` : (lastRunStatus ?? 'Unknown')}
              </Badge>
              <span className="text-[11px] text-muted-foreground">{new Date(lastRunAt).toLocaleString()}</span>
              {lastRunError ? <span className="max-w-xs truncate text-[11px] text-destructive">{lastRunError}</span> : null}
            </div>
          );
        },
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'secondary'}>
            {row.original.isActive ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
      {
        id: 'row-actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${row.original.name}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canWrite ? (
                  <>
                    <DropdownMenuItem onSelect={() => setDialogTarget(row.original)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeleting(row.original)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];
    return cols;
  }, [canWrite]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          canWrite ? (
            <Button onClick={() => setDialogTarget('create')}>
              <Plus aria-hidden /> {newLabel}
            </Button>
          ) : null
        }
      />

      {canWrite ? (
        <AdminBulkActionToolbar
          selectedCount={selectedIds.length}
          onClearSelection={() => setRowSelection({})}
          actions={[
            {
              label: 'Delete',
              icon: Trash2,
              destructive: true,
              isPending: bulkDeleteMutation.isPending,
              confirmTitle: `Delete ${selectedIds.length} rule${selectedIds.length === 1 ? '' : 's'}?`,
              confirmDescription: 'This permanently removes the selected rules. This cannot be undone.',
              onClick: () => bulkDeleteMutation.mutate(selectedIds),
            },
          ]}
        />
      ) : null}

      {!rulesQuery.isLoading && !rulesQuery.isError && rules.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <DataTable<AutomationRuleDto, unknown>
          columns={columns}
          data={rules}
          getRowId={(rule) => rule.id}
          isLoading={rulesQuery.isLoading}
          isError={rulesQuery.isError}
          errorState={<ErrorState error={rulesQuery.error} />}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={rules.length}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      {dialogTarget ? (
        <AutomationRuleBuilder
          target={dialogTarget}
          triggerType={triggerType}
          open={!!dialogTarget}
          onOpenChange={(open) => !open && setDialogTarget(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete "${deleting.name}"?`}
          description="This permanently removes the rule. This cannot be undone."
          confirmLabel="Delete rule"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      ) : null}
    </div>
  );
}

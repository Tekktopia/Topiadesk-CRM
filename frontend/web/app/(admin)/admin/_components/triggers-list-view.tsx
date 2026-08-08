'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import type { AutomationRuleDto } from '../_lib/types';

interface RenewalPlaybookConditions {
  entityType?: string;
  thresholds?: number[];
  filters?: { lineOfBusiness?: string };
}

interface RawAction {
  actionType?: string;
  params?: Record<string, unknown>;
}

// The inverse of workflows-list-view.tsx's isWorkflowRule — a rule with no
// entityType (or entityType 'RENEWAL_SCHEDULE') is exactly what
// runRenewalPlaybooks() matches (see conditionsMatch() in
// renewal-playbook.ts: `if (c.entityType && c.entityType !==
// 'RENEWAL_SCHEDULE') return false`), so the two list pages stay mutually
// exclusive over the same underlying GET /crm/automation-rules?
// triggerType=ENTITY_EVENT collection instead of the old Triggers page
// showing every ENTITY_EVENT rule including Ticket/Claim workflows mixed
// in with raw JSON.
function isRenewalPlaybookRule(rule: AutomationRuleDto): boolean {
  const conditions = rule.conditions as RenewalPlaybookConditions | undefined;
  return conditions?.entityType !== 'CASE' && conditions?.entityType !== 'CLAIM';
}

function summarizeConditions(rule: AutomationRuleDto): string {
  const c = (rule.conditions ?? {}) as RenewalPlaybookConditions;
  const thresholds = Array.isArray(c.thresholds) ? c.thresholds : [];
  const parts = [thresholds.length > 0 ? `${thresholds.join(', ')} days out` : 'Every threshold'];
  if (c.filters?.lineOfBusiness) parts.push(c.filters.lineOfBusiness);
  return parts.join(' · ');
}

const ACTION_TYPE_LABEL: Record<string, string> = {
  CREATE_TASK: 'Create task',
  SEND_NOTIFICATION: 'Notify',
};

function summarizeActions(rule: AutomationRuleDto): string {
  const actions = Array.isArray(rule.actions) ? (rule.actions as RawAction[]) : [];
  if (actions.length === 0) return '—';
  return actions.map((a) => ACTION_TYPE_LABEL[a.actionType ?? ''] ?? a.actionType ?? 'Unknown').join(', ');
}

/**
 * `/admin/triggers` — Renewal Playbook rules, built via
 * trigger-builder-view.tsx's structured form. Mirrors
 * workflows-list-view.tsx's shape exactly (same underlying
 * GET .../automation-rules?triggerType=ENTITY_EVENT collection, filtered
 * client-side to this domain's half) — replaces the old generic
 * AutomationRulesListView + raw-JSON dialog, which showed every ENTITY_EVENT
 * rule (including Ticket/Claim workflows) with conditions/actions rendered
 * as truncated JSON.
 */
export function TriggersListView() {
  const router = useRouter();
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const [deleting, setDeleting] = useState<AutomationRuleDto | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const queryKey = ['admin', 'automation-rules', 'ENTITY_EVENT'];
  const rulesQuery = useQuery({
    queryKey,
    queryFn: () => apiFetch<AutomationRuleDto[]>('/api/crm/automation-rules?triggerType=ENTITY_EVENT'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crm/automation-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Trigger deleted');
      queryClient.invalidateQueries({ queryKey });
      setDeleting(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete trigger'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => apiFetch<void>(`/api/crm/automation-rules/${id}`, { method: 'DELETE' }))),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} trigger${ids.length === 1 ? '' : 's'} deleted`);
      queryClient.invalidateQueries({ queryKey });
      setRowSelection({});
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete triggers'),
  });
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const rules = useMemo(() => (rulesQuery.data ?? []).filter(isRenewalPlaybookRule), [rulesQuery.data]);

  const columns = useMemo<ColumnDef<AutomationRuleDto>[]>(
    () => [
      selectionColumn<AutomationRuleDto>(),
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => (
          <Link href={`/admin/triggers/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'conditions',
        header: 'When',
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{summarizeConditions(row.original)}</span>,
      },
      {
        id: 'actionsSummary',
        header: 'Then',
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{summarizeActions(row.original)}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => {
          const rule = row.original;
          if (rule.status === 'DRAFT') return <Badge variant="outline">Draft</Badge>;
          return <Badge variant={rule.isActive ? 'success' : 'secondary'}>{rule.isActive ? 'Active' : 'Inactive'}</Badge>;
        },
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
                    <DropdownMenuItem onSelect={() => router.push(`/admin/triggers/${row.original.id}`)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                      <Trash2 className="h-4 w-4" aria-hidden /> Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [canWrite, router],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triggers"
        description="Real-time rules that fire when a policy renewal crosses an alert threshold — a when/then builder, no JSON. Evaluated by the Renewal Playbooks worker job."
        actions={
          canWrite ? (
            <Button onClick={() => router.push('/admin/triggers/new')}>
              <Plus aria-hidden /> New trigger
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
              confirmTitle: `Delete ${selectedIds.length} trigger${selectedIds.length === 1 ? '' : 's'}?`,
              confirmDescription: 'This permanently removes the selected triggers. This cannot be undone.',
              onClick: () => bulkDeleteMutation.mutate(selectedIds),
            },
          ]}
        />
      ) : null}

      {!rulesQuery.isLoading && !rulesQuery.isError && rules.length === 0 ? (
        <EmptyState
          title="No triggers yet"
          description="Create one to react to a policy renewal crossing a 30/60/90-day alert threshold — e.g. create a follow-up task or notify a team."
        />
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

      {deleting ? (
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete "${deleting.name}"?`}
          description="This permanently removes the trigger. This cannot be undone."
          confirmLabel="Delete trigger"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      ) : null}
    </div>
  );
}

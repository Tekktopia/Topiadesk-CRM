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
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState } from './query-states';
import { ConfirmDialog } from './confirm-dialog';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { AutomationRuleDto } from '../_lib/types';

interface WorkflowConditions {
  entityType?: 'CASE' | 'CLAIM';
  eventTypes?: string[];
}

function isWorkflowRule(rule: AutomationRuleDto): boolean {
  const conditions = rule.conditions as WorkflowConditions | undefined;
  return conditions?.entityType === 'CASE' || conditions?.entityType === 'CLAIM';
}

/**
 * `/admin/workflows` — Ticket/Claim ENTITY_EVENT rules built via
 * workflow-builder-view.tsx's structured form, filtered client-side out of
 * the same `GET /crm/automation-rules?triggerType=ENTITY_EVENT` list the
 * Renewal-Playbook "Triggers" page (automation-rules-list-view.tsx) also
 * reads — the two pages are the same underlying rule table, split purely
 * by what `conditions.entityType` each rule targets.
 */
export function WorkflowsListView() {
  const router = useRouter();
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const [deleting, setDeleting] = useState<AutomationRuleDto | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const queryKey = ['admin', 'automation-rules', 'ENTITY_EVENT'];
  const rulesQuery = useQuery({
    queryKey,
    queryFn: () => apiFetch<AutomationRuleDto[]>('/api/crm/automation-rules?triggerType=ENTITY_EVENT'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crm/automation-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Workflow deleted');
      queryClient.invalidateQueries({ queryKey });
      setDeleting(null);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete workflow'),
  });

  const rules = useMemo(() => (rulesQuery.data ?? []).filter(isWorkflowRule), [rulesQuery.data]);

  const columns = useMemo<ColumnDef<AutomationRuleDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => (
          <Link href={`/admin/workflows/${row.original.id}`} className="font-medium text-foreground hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'entityType',
        header: 'Applies to',
        enableSorting: false,
        cell: ({ row }) => {
          const conditions = row.original.conditions as WorkflowConditions | undefined;
          return <Badge variant="outline">{conditions?.entityType === 'CLAIM' ? 'Claim' : 'Ticket'}</Badge>;
        },
      },
      {
        id: 'eventTypes',
        header: 'Trigger',
        enableSorting: false,
        cell: ({ row }) => {
          const conditions = row.original.conditions as WorkflowConditions | undefined;
          const events = conditions?.eventTypes ?? [];
          return <span className="text-sm text-muted-foreground">{events.length > 0 ? events.join(', ') : '—'}</span>;
        },
      },
      {
        id: 'stepCount',
        header: 'Steps',
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{Array.isArray(row.original.steps) ? row.original.steps.length : 0}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
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
                    <DropdownMenuItem onSelect={() => router.push(`/admin/workflows/${row.original.id}`)}>Edit</DropdownMenuItem>
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
        title="Workflows"
        description="Admin-configurable automation for Tickets and Claims — a trigger, optional conditions, and an ordered list of steps (assign, notify, set fields, require approval). Activating a workflow takes effect immediately."
        actions={
          canWrite ? (
            <Button onClick={() => router.push('/admin/workflows/new')}>
              <Plus aria-hidden /> New workflow
            </Button>
          ) : null
        }
      />

      {!rulesQuery.isLoading && !rulesQuery.isError && rules.length === 0 ? (
        <EmptyState
          title="No workflows yet"
          description="Create one to automate assignment, notifications, and approvals for tickets and claims."
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
        />
      )}

      {deleting ? (
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete "${deleting.name}"?`}
          description="This permanently removes the workflow. This cannot be undone."
          confirmLabel="Delete workflow"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      ) : null}
    </div>
  );
}

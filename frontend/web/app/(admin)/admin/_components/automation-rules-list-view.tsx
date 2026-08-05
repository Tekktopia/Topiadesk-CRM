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
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState } from './query-states';
import { ConfirmDialog } from './confirm-dialog';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { AutomationRuleDto, AutomationTriggerType } from '../_lib/types';
import { AutomationRuleFormDialog } from './automation-rule-form-dialog';

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

  const rules = rulesQuery.data ?? [];

  const columns = useMemo<ColumnDef<AutomationRuleDto>[]>(() => {
    const cols: ColumnDef<AutomationRuleDto>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        id: 'conditions',
        header: 'Conditions',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-xs truncate font-mono text-xs text-muted-foreground">
            {JSON.stringify(row.original.conditions)}
          </span>
        ),
      },
      {
        id: 'actionsSpec',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-xs truncate font-mono text-xs text-muted-foreground">
            {JSON.stringify(row.original.actions)}
          </span>
        ),
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
        />
      )}

      {dialogTarget ? (
        <AutomationRuleFormDialog
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

'use client';

import * as React from 'react';
import { FlaskConical, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
} from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { humanize } from '../../_lib/constants';
import { useAssignmentRules, useCan, useDeleteAssignmentRule, useTestAssignmentRule } from '../../_lib/hooks';
import type { AssignmentRule } from '../../_lib/types';
import { AssignmentRuleFormDialog } from './assignment-rule-form-dialog';

/** Assignment rule CRUD — same 'sla_config' admin-authored tier as SLA policies (see assignment-rules.controller.ts's header comment). */
export function AssignmentRulesListView() {
  const { data, isLoading, isError } = useAssignmentRules();
  const rules = data ?? [];
  // Button-gating only — real enforcement is assignment-rules.controller.ts's
  // @RequirePermission('sla_config', 'write') guard (POST :id/test is
  // 'sla_config':'read', so Test stays available regardless of canWrite).
  // See hooks.ts's useCan() header comment for why 'sla_config'.
  const canWrite = useCan('sla_config', 'write');
  const deleteRule = useDeleteAssignmentRule();
  const testRule = useTestAssignmentRule();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AssignmentRule | null>(null);
  const [deleting, setDeleting] = React.useState<AssignmentRule | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const columns = React.useMemo<ColumnDef<AssignmentRule>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: 'entityType',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Applies to" />,
        meta: { label: 'Applies to' },
        cell: ({ row }) => <span className="text-muted-foreground">{humanize(row.original.entityType)}</span>,
      },
      {
        accessorKey: 'strategy',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Strategy" />,
        meta: { label: 'Strategy' },
        cell: ({ row }) => <span className="text-muted-foreground">{humanize(row.original.strategy)}</span>,
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Priority" />,
        meta: { label: 'Priority' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.priority}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Active" />,
        meta: { label: 'Active' },
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'outline'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Rule actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canWrite ? <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem> : null}
              <DropdownMenuItem onSelect={() => testRule.mutate(row.original.id)}>
                <FlaskConical aria-hidden /> Test
              </DropdownMenuItem>
              {canWrite ? (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                  <Trash2 aria-hidden /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [testRule, canWrite],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignment Rules"
        description="How new claims/cases route to an owner — round robin, load-based, or skill-based, evaluated highest priority first."
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New rule
            </Button>
          ) : undefined
        }
      />

      {!isLoading && !isError && rules.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No assignment rules yet"
              description="Create one to automate who new claims/cases get routed to."
              action={
                canWrite ? (
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus aria-hidden /> New rule
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<AssignmentRule, unknown>
          columns={columns}
          data={rules}
          getRowId={(r) => r.id}
          isLoading={isLoading}
          isError={isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={rules.length}
        />
      )}

      {canWrite && createOpen ? <AssignmentRuleFormDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
      {canWrite && editing ? <AssignmentRuleFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} rule={editing} /> : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the assignment rule. This cannot be undone."
        confirmLabel="Delete rule"
        destructive
        isPending={deleteRule.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteRule.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

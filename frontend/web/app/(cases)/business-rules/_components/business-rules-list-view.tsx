'use client';

import * as React from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import { useBusinessRules, useCan, useDeleteBusinessRule } from '../../_lib/hooks';
import type { BusinessRule } from '../../_lib/types';
import { BusinessRuleFormDialog } from './business-rule-form-dialog';

const CONDITION_FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  caseType: 'Ticket type',
  categoryId: 'Category',
  assignedTeamId: 'Assigned team',
};

/**
 * Business rule CRUD — admin/config tier, gated on 'business_rule' at ALL
 * scope (ADMIN only, see seed.ts's comment on why this doesn't reuse
 * 'case' the way case_categories does). One list + one create/edit dialog,
 * same shape as sla-policies-list-view.tsx.
 */
export function BusinessRulesListView() {
  const { data, isLoading, isError } = useBusinessRules('CASE');
  const rules = data ?? [];
  const canWrite = useCan('business_rule', 'write');
  const deleteRule = useDeleteBusinessRule();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BusinessRule | null>(null);
  const [deleting, setDeleting] = React.useState<BusinessRule | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const columns = React.useMemo<ColumnDef<BusinessRule>[]>(() => {
    const cols: ColumnDef<BusinessRule>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-foreground">{row.original.name}</div>
            {row.original.description ? <div className="text-xs text-muted-foreground">{row.original.description}</div> : null}
          </div>
        ),
      },
      {
        id: 'condition',
        header: 'If',
        meta: { label: 'If' },
        accessorFn: (r) => `${CONDITION_FIELD_LABEL[r.conditionField] ?? r.conditionField} ${r.conditionOperator === 'EQUALS' ? '=' : '≠'} ${r.conditionValue}`,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'effects',
        header: 'Then',
        meta: { label: 'Then' },
        accessorFn: (r) => r.actions.length,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.actions.length} effect{row.original.actions.length === 1 ? '' : 's'}</span>,
      },
      {
        accessorKey: 'displayOrder',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Order" />,
        meta: { label: 'Order' },
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.displayOrder}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Active" />,
        meta: { label: 'Active' },
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'outline'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
    ];
    if (canWrite) {
      cols.push({
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
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      });
    }
    return cols;
  }, [canWrite]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Rules"
        description="No-code field logic for tickets — require, hide, make read-only, or auto-set fields when a condition matches. Enforced on save, previewed live on the ticket form."
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
              title="No business rules yet"
              description="Create one to require, hide, or auto-set ticket fields based on a condition."
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
        <DataTable<BusinessRule, unknown>
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

      {canWrite && createOpen ? <BusinessRuleFormDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
      {canWrite && editing ? (
        <BusinessRuleFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} rule={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the business rule. Tickets it already affected keep whatever values were set at the time."
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

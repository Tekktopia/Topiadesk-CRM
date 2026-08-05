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
import { humanize } from '../../_lib/constants';
import { useCan, useDeleteSlaPolicy, useSlaPolicies } from '../../_lib/hooks';
import type { SlaPolicy } from '../../_lib/types';
import { SlaPolicyFormDialog } from './sla-policy-form-dialog';

/**
 * SLA policy CRUD — admin/config tier (see sla-policies.controller.ts's
 * header comment: gated on 'sla_config' at ALL scope, so only ADMIN/
 * SYSTEM_JOB/explicitly-scoped roles reach this in practice). Kept
 * functional, not gold-plated: one list + one create/edit dialog with an
 * inline targets sub-section, no separate detail page.
 */
export function SlaPoliciesListView() {
  const { data, isLoading, isError } = useSlaPolicies();
  const policies = data ?? [];
  // Button-gating only — the real enforcement is sla-policies.controller.ts's
  // @RequirePermission('sla_config', 'write') guard; this just keeps the UI
  // from offering an action that would 403. See hooks.ts's useCan() header
  // comment for why 'sla_config' (not a per-page resource).
  const canWrite = useCan('sla_config', 'write');
  const deletePolicy = useDeleteSlaPolicy();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SlaPolicy | null>(null);
  const [deleting, setDeleting] = React.useState<SlaPolicy | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const columns = React.useMemo<ColumnDef<SlaPolicy>[]>(() => {
    const cols: ColumnDef<SlaPolicy>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        meta: { label: 'Name' },
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: 'entityType',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Entity" />,
        meta: { label: 'Entity' },
        cell: ({ row }) => <span className="text-muted-foreground">{humanize(row.original.entityType)}</span>,
      },
      {
        id: 'caseType',
        header: 'Case type',
        meta: { label: 'Case type' },
        accessorFn: (p) => (p.caseType ? humanize(p.caseType) : 'Any'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'priority',
        header: 'Priority',
        meta: { label: 'Priority' },
        accessorFn: (p) => (p.priority ? humanize(p.priority) : 'Any'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'targets',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Targets" />,
        meta: { label: 'Targets' },
        accessorFn: (p) => p.targets?.length ?? 0,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<number>()}</span>,
      },
      {
        accessorKey: 'rank',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Rank" />,
        meta: { label: 'Rank' },
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.rank}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Active" />,
        meta: { label: 'Active' },
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'outline'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
    ];
    // Edit/Delete are actions no @RequirePermission('sla_config', 'write')
    // grant means "would 403" — omit the whole actions column rather than
    // show an effectively-empty dropdown.
    if (canWrite) {
      cols.push({
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Policy actions">
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
        title="SLA Policies"
        description="Response/resolution targets applied to claims and cases, with optional per-stage escalation."
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New SLA policy
            </Button>
          ) : undefined
        }
      />

      {!isLoading && !isError && policies.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No SLA policies yet"
              description="Create one to start tracking response/resolution targets."
              action={
                canWrite ? (
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus aria-hidden /> New SLA policy
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<SlaPolicy, unknown>
          columns={columns}
          data={policies}
          getRowId={(p) => p.id}
          isLoading={isLoading}
          isError={isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={policies.length}
        />
      )}

      {canWrite && createOpen ? <SlaPolicyFormDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
      {canWrite && editing ? (
        <SlaPolicyFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} policyId={editing.id} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This permanently removes the SLA policy and its targets. Claims/cases already using it keep their existing SlaClock rows."
        confirmLabel="Delete policy"
        destructive
        isPending={deletePolicy.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deletePolicy.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

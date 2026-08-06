'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  DataTableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
  type ColumnDef,
} from '@topiadesk/ui';
import { useCan } from '@/app/(cases)/_lib/hooks';
import { formatNaira } from '@/app/(policy)/lib/format';
import type { ApprovalThresholdRule } from '@/app/(policy)/lib/types';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { ApprovalThresholdRuleFormDialog } from './approval-threshold-rule-form-dialog';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Admin CRUD for ApprovalThresholdRule — how many approvals a
 * POLICY_ENDORSEMENT/CANCELLATION needs once its premiumImpact/sumInsured
 * crosses minAmount. Consumed by policy-lifecycle.ts's
 * resolveApprovalThreshold() the moment a rule is saved — no restart
 * needed, same "takes effect on the very next matching event" property
 * this session's other admin-config pages already have.
 */
export function ApprovalThresholdRulesView() {
  const canWrite = useCan('approval', 'write');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ApprovalThresholdRule | null>(null);
  const [deleting, setDeleting] = React.useState<ApprovalThresholdRule | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const rulesQuery = useQuery({
    queryKey: ['approval-threshold-rules'],
    queryFn: () => fetchJson<ApprovalThresholdRule[]>('/api/policies/approval-threshold-rules'),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => fetch(`/api/policies/approval-threshold-rules/${id}`, { method: 'DELETE', credentials: 'same-origin' }),
    onSuccess: () => {
      toast.success('Rule deleted');
      queryClient.invalidateQueries({ queryKey: ['approval-threshold-rules'] });
      setDeleting(null);
    },
    onError: () => toast.error('Failed to delete rule'),
  });

  const columns = React.useMemo<ColumnDef<ApprovalThresholdRule>[]>(
    () => [
      {
        accessorKey: 'versionType',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Version type" />,
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.versionType}</span>,
      },
      {
        id: 'minAmount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Amount at/above" />,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.minAmount ? formatNaira(row.original.minAmount) : 'Any amount (catch-all)'}</span>,
      },
      {
        accessorKey: 'requiredApprovals',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Required approvals" />,
        cell: ({ row }) => <Badge variant={row.original.requiredApprovals > 1 ? 'warning' : 'secondary'}>{row.original.requiredApprovals}</Badge>,
      },
      {
        id: 'row-actions',
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
              {canWrite ? (
                <>
                  <DropdownMenuItem onSelect={() => setEditing(row.original)}>Edit</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(row.original)}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [canWrite],
  );

  const rules = rulesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Approval rules</h1>
          <p className="text-sm text-muted-foreground">
            How many approvals a policy endorsement or cancellation needs once its amount crosses a threshold — e.g. require 2
            approvers above ₦10M. No rules configured for a version type means the existing single-approver flow, unchanged.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New rule
          </Button>
        ) : null}
      </div>

      <DataTable<ApprovalThresholdRule, unknown>
        columns={columns}
        data={rules}
        getRowId={(r) => r.id}
        isLoading={rulesQuery.isLoading}
        isError={rulesQuery.isError}
        errorState={<span className="text-sm text-destructive">Couldn&apos;t load approval rules.</span>}
        pagination={pagination}
        onPaginationChange={setPagination}
        emptyState={<span className="text-sm text-muted-foreground">No rules yet — every gated policy version needs exactly 1 approval by default.</span>}
      />

      <ApprovalThresholdRuleFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? (
        <ApprovalThresholdRuleFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} rule={editing} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete this rule for ${deleting?.versionType}?`}
        description="Version submissions crossing this threshold will fall back to the next most-specific rule, or 1 required approval if none remain."
        confirmLabel="Delete rule"
        destructive
        isPending={deleteRule.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteRule.mutate(deleting.id);
        }}
      />
    </div>
  );
}

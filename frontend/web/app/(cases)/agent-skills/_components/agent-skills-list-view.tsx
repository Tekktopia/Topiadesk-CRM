'use client';

import * as React from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
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
import { useAgentSkills, useCan, useDeleteAgentSkill, useDirectoryUsers } from '../../_lib/hooks';
import type { AgentSkill } from '../../_lib/types';
import { AgentSkillFormDialog } from './agent-skill-form-dialog';

/**
 * Agent skill CRUD — admin/config tier (see agent-skills.controller.ts's
 * header comment: gated on 'sla_config' at ALL scope). Feeds SKILL_BASED
 * assignment rules' requiredSkillTags matching. Mirrors sla-policies/
 * macros' list+dialog shape; agent name resolution degrades to the raw
 * userId when the caller lacks identity:read (same convention as
 * cases-list-view.tsx's assignedToId column).
 */
export function AgentSkillsListView() {
  const { data, isLoading, isError } = useAgentSkills();
  const skills = data ?? [];
  const { usersById } = useDirectoryUsers();
  // Button-gating only — real enforcement is agent-skills.controller.ts's
  // @RequirePermission('sla_config', 'write') guard. See hooks.ts's
  // useCan() header comment for why 'sla_config' (not a per-page resource).
  const canWrite = useCan('sla_config', 'write');
  const deleteSkill = useDeleteAgentSkill();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AgentSkill | null>(null);
  const [deleting, setDeleting] = React.useState<AgentSkill | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });

  const columns = React.useMemo<ColumnDef<AgentSkill>[]>(() => {
    const cols: ColumnDef<AgentSkill>[] = [
      {
        id: 'agent',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Agent" />,
        meta: { label: 'Agent' },
        accessorFn: (s) => usersById.get(s.userId)?.fullName ?? s.userId,
        cell: ({ getValue }) => <span className="font-medium text-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'skillTag',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Skill tag" />,
        meta: { label: 'Skill tag' },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.skillTag}</span>,
      },
      {
        id: 'proficiency',
        header: 'Proficiency',
        meta: { label: 'Proficiency' },
        accessorFn: (s) => s.proficiency ?? 0,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.proficiency != null ? `${row.original.proficiency}/5` : '—'}</span>,
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
              <Button variant="ghost" size="icon" aria-label="Skill actions">
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
  }, [usersById, canWrite]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Skills"
        description="Skill tags assigned to agents, matched against an assignment rule's required skills for SKILL_BASED routing."
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New skill
            </Button>
          ) : undefined
        }
      />

      {!isLoading && !isError && skills.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No agent skills yet"
              description="Tag an agent with a skill to make them eligible for SKILL_BASED assignment rules."
              action={
                canWrite ? (
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus aria-hidden /> New skill
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable<AgentSkill, unknown>
          columns={columns}
          data={skills}
          getRowId={(s) => s.id}
          isLoading={isLoading}
          isError={isError}
          pagination={pagination}
          onPaginationChange={setPagination}
          totalRowCount={skills.length}
        />
      )}

      {canWrite && createOpen ? <AgentSkillFormDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
      {canWrite && editing ? <AgentSkillFormDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} skill={editing} /> : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove "${deleting?.skillTag}"?`}
        description="This permanently removes this skill tag from the agent. This cannot be undone."
        confirmLabel="Remove skill"
        destructive
        isPending={deleteSkill.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteSkill.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

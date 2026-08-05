'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button, type ColumnDef, DataTable, DataTableColumnHeader, Skeleton, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { TeamDto } from '../_lib/types';
import { TeamFormDialog } from './team-form-dialog';
import { TeamDetailDialog } from './team-detail-dialog';

export default function TeamsPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const teamsQuery = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => apiFetch<TeamDto[]>('/api/admin/teams') });

  const [formTarget, setFormTarget] = useState<'create' | TeamDto | null>(null);
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TeamDto | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Team deleted');
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete team'),
  });

  const columns = useMemo<ColumnDef<TeamDto>[]>(() => {
    const cols: ColumnDef<TeamDto>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.original.name}</span>
            <span className="line-clamp-1 text-xs text-muted-foreground">{row.original.description ?? 'No description'}</span>
          </div>
        ),
      },
      {
        accessorKey: 'memberCount',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Members" className="justify-end" />,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums text-muted-foreground">
            {row.original.memberCount} member{row.original.memberCount === 1 ? '' : 's'}
          </span>
        ),
      },
    ];
    if (canWrite) {
      cols.push({
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${row.original.name}`}
              onClick={() => setPendingDelete(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      });
    }
    return cols;
  }, [canWrite]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Additive visibility-grant groupings — membership widens who can see a record beyond department/branch scope, it isn't a third RLS scope level."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setFormTarget('create')}>
              <Plus className="h-4 w-4" /> New team
            </Button>
          ) : undefined
        }
      />

      {teamsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : teamsQuery.isError ? (
        <ErrorState error={teamsQuery.error} />
      ) : (teamsQuery.data ?? []).length === 0 ? (
        <EmptyState title="No teams yet" icon={<Users className="h-8 w-8" aria-hidden />} />
      ) : (
        <DataTable<TeamDto, unknown>
          columns={columns}
          data={teamsQuery.data ?? []}
          getRowId={(t) => t.id}
          onRowClick={(t) => setDetailTeamId(t.id)}
        />
      )}

      {formTarget ? (
        <TeamFormDialog target={formTarget} open={!!formTarget} onOpenChange={(open) => !open && setFormTarget(null)} />
      ) : null}

      {detailTeamId ? (
        <TeamDetailDialog
          teamId={detailTeamId}
          canWrite={canWrite}
          open={!!detailTeamId}
          onOpenChange={(open) => !open && setDetailTeamId(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open={!!pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete "${pendingDelete.name}"?`}
          description="All member records for this team are removed. This cannot be undone."
          confirmLabel="Delete"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        />
      ) : null}
    </div>
  );
}

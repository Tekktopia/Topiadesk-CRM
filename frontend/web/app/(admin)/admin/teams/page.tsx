'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button, Card, CardContent, Skeleton, toast } from '@topiadesk/ui';
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : teamsQuery.isError ? (
        <ErrorState error={teamsQuery.error} />
      ) : (teamsQuery.data ?? []).length === 0 ? (
        <EmptyState title="No teams yet" icon={<Users className="h-8 w-8" aria-hidden />} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teamsQuery.data?.map((team) => (
            <Card key={team.id} className="cursor-pointer transition-shadow hover:shadow-brand-md" onClick={() => setDetailTeamId(team.id)}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-foreground">{team.name}</p>
                  {canWrite ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${team.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(team);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{team.description ?? 'No description'}</p>
                <p className="text-xs text-muted-foreground">
                  {team.memberCount} member{team.memberCount === 1 ? '' : 's'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
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

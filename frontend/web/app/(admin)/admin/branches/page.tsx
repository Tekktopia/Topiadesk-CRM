'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { useBranches } from '../_lib/queries';
import { canWriteAdmin } from '../_lib/permissions';
import type { BranchDto } from '../_lib/types';
import { BranchFormDialog } from './branch-form-dialog';

export default function BranchesPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();
  const branchesQuery = useBranches();

  const [formTarget, setFormTarget] = useState<'create' | BranchDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BranchDto | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/branches/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Branch deleted');
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete branch'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description="Physical office locations used for branch-scoped record visibility (RLS BRANCH scope)."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setFormTarget('create')}>
              <Plus className="h-4 w-4" /> New branch
            </Button>
          ) : undefined
        }
      />

      {branchesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : branchesQuery.isError ? (
        <ErrorState error={branchesQuery.error} />
      ) : (branchesQuery.data ?? []).length === 0 ? (
        <EmptyState title="No branches yet" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Country</TableHead>
                {canWrite ? <TableHead className="w-24">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(branchesQuery.data ?? []).map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium text-foreground">{b.name}</TableCell>
                  <TableCell className="text-muted-foreground">{b.code}</TableCell>
                  <TableCell className="text-muted-foreground">{b.city ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{b.state ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{b.country ?? '—'}</TableCell>
                  {canWrite ? (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${b.name}`} onClick={() => setFormTarget(b)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${b.name}`}
                          onClick={() => setPendingDelete(b)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {formTarget ? (
        <BranchFormDialog target={formTarget} open={!!formTarget} onOpenChange={(open) => !open && setFormTarget(null)} />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open={!!pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete "${pendingDelete.name}"?`}
          description="Users still pointing at this branch will keep the reference, but the branch will no longer be selectable."
          confirmLabel="Delete"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        />
      ) : null}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { useDepartments } from '../_lib/queries';
import { canWriteAdmin } from '../_lib/permissions';
import type { DepartmentDto } from '../_lib/types';
import { DepartmentFormDialog } from './department-form-dialog';

export default function DepartmentsPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();
  const departmentsQuery = useDepartments();

  const [formTarget, setFormTarget] = useState<'create' | DepartmentDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DepartmentDto | null>(null);

  const nameById = useMemo(
    () => new Map((departmentsQuery.data ?? []).map((d) => [d.id, d.name])),
    [departmentsQuery.data],
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/departments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Department deleted');
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete department'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Org placement used for department-scoped record visibility (RLS DEPARTMENT scope)."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setFormTarget('create')}>
              <Plus className="h-4 w-4" /> New department
            </Button>
          ) : undefined
        }
      />

      {departmentsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : departmentsQuery.isError ? (
        <ErrorState error={departmentsQuery.error} />
      ) : (departmentsQuery.data ?? []).length === 0 ? (
        <EmptyState title="No departments yet" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Parent department</TableHead>
                {canWrite ? <TableHead className="w-24">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(departmentsQuery.data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-foreground">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.code}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {d.parentDepartmentId ? (nameById.get(d.parentDepartmentId) ?? '—') : '—'}
                  </TableCell>
                  {canWrite ? (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${d.name}`} onClick={() => setFormTarget(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${d.name}`}
                          onClick={() => setPendingDelete(d)}
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
        <DepartmentFormDialog
          target={formTarget}
          allDepartments={departmentsQuery.data ?? []}
          open={!!formTarget}
          onOpenChange={(open) => !open && setFormTarget(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open={!!pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete "${pendingDelete.name}"?`}
          description="Users and reference data still pointing at this department will keep the reference, but the department will no longer be selectable."
          confirmLabel="Delete"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        />
      ) : null}
    </div>
  );
}

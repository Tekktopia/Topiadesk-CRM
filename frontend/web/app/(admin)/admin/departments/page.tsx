'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button, Skeleton, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { useDepartments, useUsers } from '../_lib/queries';
import { canWriteAdmin } from '../_lib/permissions';
import type { DepartmentDto, UserDto } from '../_lib/types';
import { DepartmentFormDialog } from './department-form-dialog';
import { DepartmentTree } from './department-tree';

export default function DepartmentsPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();
  const departmentsQuery = useDepartments();
  const usersQuery = useUsers();

  const [formTarget, setFormTarget] = useState<'create' | DepartmentDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DepartmentDto | null>(null);

  const usersByDepartment = useMemo(() => {
    const map = new Map<string, UserDto[]>();
    for (const u of usersQuery.data ?? []) {
      if (!u.departmentId) continue;
      const list = map.get(u.departmentId);
      if (list) list.push(u);
      else map.set(u.departmentId, [u]);
    }
    return map;
  }, [usersQuery.data]);

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
        description="Org chart, contact details, and department-scoped record visibility (RLS DEPARTMENT scope)."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setFormTarget('create')}>
              <Plus className="h-4 w-4" /> New department
            </Button>
          ) : undefined
        }
      />

      {departmentsQuery.isLoading || usersQuery.isLoading ? (
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
        <DepartmentTree
          departments={departmentsQuery.data ?? []}
          usersByDepartment={usersByDepartment}
          canWrite={canWrite}
          onEdit={setFormTarget}
          onDelete={setPendingDelete}
        />
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

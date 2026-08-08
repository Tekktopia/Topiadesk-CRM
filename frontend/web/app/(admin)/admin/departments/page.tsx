'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, type ColumnDef, DataTable, DataTableColumnHeader, type RowSelectionState, selectionColumn, Skeleton, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { AdminBulkActionToolbar } from '../_components/admin-bulk-action-toolbar';
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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => apiFetch<void>(`/api/admin/departments/${id}`, { method: 'DELETE' }))),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} department${ids.length === 1 ? '' : 's'} deleted`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
      setRowSelection({});
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete departments'),
  });
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const columns = useMemo<ColumnDef<DepartmentDto>[]>(() => {
    const cols: ColumnDef<DepartmentDto>[] = [
      selectionColumn<DepartmentDto>(),
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        accessorKey: 'code',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Code" />,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.code}</span>,
      },
      {
        id: 'parentDepartment',
        header: 'Parent department',
        accessorFn: (d) => (d.parentDepartmentId ? (nameById.get(d.parentDepartmentId) ?? '—') : '—'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
    ];
    if (canWrite) {
      cols.push({
        id: 'actions',
        header: 'Actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.name}`} onClick={() => setFormTarget(row.original)}>
              <Pencil className="h-4 w-4" />
            </Button>
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
  }, [canWrite, nameById]);

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

      {canWrite ? (
        <AdminBulkActionToolbar
          selectedCount={selectedIds.length}
          onClearSelection={() => setRowSelection({})}
          actions={[
            {
              label: 'Delete',
              icon: Trash2,
              destructive: true,
              isPending: bulkDeleteMutation.isPending,
              confirmTitle: `Delete ${selectedIds.length} department${selectedIds.length === 1 ? '' : 's'}?`,
              confirmDescription: 'Users and reference data still pointing at these departments will keep the reference, but the departments will no longer be selectable.',
              onClick: () => bulkDeleteMutation.mutate(selectedIds),
            },
          ]}
        />
      ) : null}

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
        <DataTable<DepartmentDto, unknown>
          columns={columns}
          data={departmentsQuery.data ?? []}
          getRowId={(d) => d.id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
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

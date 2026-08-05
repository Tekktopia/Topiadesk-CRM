'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, type ColumnDef, DataTable, DataTableColumnHeader, Skeleton, toast } from '@topiadesk/ui';
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

  const columns = useMemo<ColumnDef<BranchDto>[]>(() => {
    const cols: ColumnDef<BranchDto>[] = [
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
        accessorKey: 'city',
        header: ({ column }) => <DataTableColumnHeader column={column} label="City" />,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.city ?? '—'}</span>,
      },
      {
        accessorKey: 'state',
        header: 'State',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.state ?? '—'}</span>,
      },
      {
        accessorKey: 'country',
        header: 'Country',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.country ?? '—'}</span>,
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
  }, [canWrite]);

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
        <DataTable<BranchDto, unknown> columns={columns} data={branchesQuery.data ?? []} getRowId={(b) => b.id} />
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

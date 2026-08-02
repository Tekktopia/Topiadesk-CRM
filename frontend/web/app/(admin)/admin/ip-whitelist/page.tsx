'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { useRoles } from '../_lib/queries';
import { canWriteAdmin } from '../_lib/permissions';
import type { IpWhitelistEntryDto } from '../_lib/types';
import { IpWhitelistFormDialog } from './ip-whitelist-form-dialog';

export default function IpWhitelistPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const entriesQuery = useQuery({
    queryKey: ['admin', 'ip-whitelist'],
    queryFn: () => apiFetch<IpWhitelistEntryDto[]>('/api/admin/ip-whitelist'),
  });
  const rolesQuery = useRoles();
  const roleNameById = useMemo(() => new Map((rolesQuery.data ?? []).map((r) => [r.id, r.name])), [rolesQuery.data]);

  const [formTarget, setFormTarget] = useState<'create' | IpWhitelistEntryDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IpWhitelistEntryDto | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/ip-whitelist/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Entry deleted');
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'ip-whitelist'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to delete entry'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="IP Whitelist"
        description="CIDR ranges admin CRUD manages here. Enforcement is a separate app-layer middleware gated by the IP_WHITELIST_ENFORCED flag — not yet wired in, so entries here are recorded but not yet actively blocking traffic."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setFormTarget('create')}>
              <Plus className="h-4 w-4" /> New entry
            </Button>
          ) : undefined
        }
      />

      {entriesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : entriesQuery.isError ? (
        <ErrorState error={entriesQuery.error} />
      ) : (entriesQuery.data ?? []).length === 0 ? (
        <EmptyState title="No whitelist entries yet" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CIDR range</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Created</TableHead>
                {canWrite ? <TableHead className="w-24">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entriesQuery.data ?? []).map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-sm text-foreground">{entry.cidrRange}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{entry.description ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.appliesToRoleId ? (roleNameById.get(entry.appliesToRoleId) ?? '—') : 'All roles'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.isActive ? 'success' : 'secondary'}>{entry.isActive ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleDateString()}</TableCell>
                  {canWrite ? (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${entry.cidrRange}`} onClick={() => setFormTarget(entry)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${entry.cidrRange}`}
                          onClick={() => setPendingDelete(entry)}
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
        <IpWhitelistFormDialog target={formTarget} open={!!formTarget} onOpenChange={(open) => !open && setFormTarget(null)} />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open={!!pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete "${pendingDelete.cidrRange}"?`}
          description="This range will no longer be recorded as whitelisted."
          confirmLabel="Delete"
          destructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        />
      ) : null}
    </div>
  );
}

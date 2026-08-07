'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldQuestion, X } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { EmptyState, ErrorState } from '../_components/query-states';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { canReadAdmin } from '../_lib/permissions';
import { useRoleGrants } from '../_lib/queries';
import type { DecideRoleGrantBody, PendingRoleGrantDto } from '../_lib/types';

/**
 * Approve/reject queue for role grants gated by Role.requiredApprovalsToGrant
 * > 1 (ADMIN/COMPLIANCE_OFFICER, seeded to 2 — see prisma/seed.ts). Reuses
 * the exact same segregation-of-duties rules Policy version approvals
 * already enforce (see version-history.tsx's decide dialog for the sibling
 * pattern): the requester can't decide their own request, and each approver
 * can only decide once per chain — both enforced server-side, surfaced here
 * as a plain error toast rather than pre-emptively hidden, since who
 * requested a given grant isn't always obvious at a glance.
 */
export default function RoleGrantsPage() {
  const { user: currentUser } = useCurrentUser();
  const canDecide = canReadAdmin(currentUser); // ADMIN or COMPLIANCE_OFFICER — matches who actually holds approval:write
  const queryClient = useQueryClient();
  const grantsQuery = useRoleGrants();
  const [deciding, setDeciding] = useState<{ grant: PendingRoleGrantDto; decision: 'APPROVED' | 'REJECTED' } | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'role-grants'] });
  }

  const decideMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DecideRoleGrantBody }) =>
      apiFetch<PendingRoleGrantDto>(`/api/admin/role-grants/${id}/decision`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (result, { body }) => {
      if (body.decision === 'APPROVED' && result.approvedCount >= result.requiredApprovals) {
        toast.success(`"${result.roleName}" granted to ${result.userName}`);
      } else if (body.decision === 'APPROVED') {
        toast.success(`Approved — ${result.approvedCount} of ${result.requiredApprovals} approvers so far`);
      } else {
        toast.success('Role grant rejected');
      }
      setDeciding(null);
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to record decision'),
  });

  const grants = grantsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pending role grants"
        description="Roles requiring more than one approver to grant (ADMIN and COMPLIANCE_OFFICER by default) show up here until enough approvers decide."
      />

      {grantsQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : grantsQuery.isError ? (
        <ErrorState error={grantsQuery.error} />
      ) : grants.length === 0 ? (
        <EmptyState icon={<ShieldQuestion className="h-8 w-8" aria-hidden />} title="Nothing pending" description="No role grants are currently awaiting approval." />
      ) : (
        <div className="space-y-3">
          {grants.map((grant) => (
            <Card key={grant.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium text-foreground">
                    Grant <Badge variant="outline">{grant.roleName}</Badge> to {grant.userName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested by {grant.requestedByName} · {new Date(grant.createdAt).toLocaleString()} · {grant.approvedCount} of {grant.requiredApprovals} approvals
                  </p>
                </div>
                {canDecide ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeciding({ grant, decision: 'REJECTED' })}
                    >
                      <X className="h-4 w-4" /> Reject
                    </Button>
                    <Button size="sm" onClick={() => setDeciding({ grant, decision: 'APPROVED' })}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deciding}
        onOpenChange={(open) => !open && setDeciding(null)}
        title={deciding ? `${deciding.decision === 'APPROVED' ? 'Approve' : 'Reject'} granting "${deciding.grant.roleName}" to ${deciding.grant.userName}?` : ''}
        description={
          deciding?.decision === 'REJECTED'
            ? 'This immediately cancels the request — the requester will need to start over if the role is still needed.'
            : 'You cannot decide your own request, and you can only decide once per grant — both enforced server-side.'
        }
        confirmLabel={deciding?.decision === 'APPROVED' ? 'Approve' : 'Reject'}
        destructive={deciding?.decision === 'REJECTED'}
        isPending={decideMutation.isPending}
        onConfirm={() => {
          if (!deciding) return;
          decideMutation.mutate({ id: deciding.grant.id, body: { decision: deciding.decision } });
        }}
      />
    </div>
  );
}

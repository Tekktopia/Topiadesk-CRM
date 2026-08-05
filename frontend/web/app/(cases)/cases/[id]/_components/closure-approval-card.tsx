'use client';

import { Loader2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@topiadesk/ui';
import { formatDateTime } from '../../../_lib/format';
import { useCan, useCaseClosureApproval, useDecideCaseClosure } from '../../../_lib/hooks';

const STATUS_VARIANT = {
  PENDING: 'secondary',
  APPROVED: 'success',
  REJECTED: 'destructive',
} as const;

/**
 * COMPLAINT cases only — closing one requires a second, non-requester
 * COMPLIANCE_OFFICER/ADMIN approval (see cases.controller.ts's
 * request-closure/closure-decision endpoints and the schema comment on
 * ApprovalEntityType.CASE_CLOSURE). Approve/Reject buttons are a
 * client-side hint gated by useCan('approval','write') — the server is
 * the real enforcement (a 403 plus the DB's
 * approvals_requester_ne_approver CHECK), matching every other
 * permission-gated action button in this app.
 */
export function ClosureApprovalCard({ caseId }: { caseId: string }) {
  const { data: approval, isLoading } = useCaseClosureApproval(caseId);
  const decide = useDecideCaseClosure(caseId);
  const canDecide = useCan('approval', 'write');

  if (isLoading || !approval) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Closure approval</CardTitle>
        <Badge variant={STATUS_VARIANT[approval.status]}>{approval.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {approval.status === 'PENDING' ? (
          <>
            <p className="text-sm text-muted-foreground">
              This complaint case can&apos;t close until a compliance officer other than the requester approves it.
            </p>
            {canDecide ? (
              <div className="flex gap-2">
                <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ decision: 'APPROVED' })}>
                  {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Approve &amp; close
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ decision: 'REJECTED' })}
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {approval.status === 'APPROVED' ? 'Approved' : 'Rejected'}
            {approval.decidedAt ? ` on ${formatDateTime(approval.decidedAt)}` : ''}
            {approval.reason ? ` — ${approval.reason}` : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

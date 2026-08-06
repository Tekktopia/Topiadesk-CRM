'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { ShieldAlert } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { approvalStatusVariant, formatDate, formatNaira } from '@/app/(policy)/lib/format';
import type { PolicyVersionDto, UserOption } from '@/app/(policy)/lib/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Full PolicyVersion history for this policy, including the maker-checker
 * approval status on ENDORSEMENT/CANCELLATION rows. A PENDING row gets a
 * "Decide" button that opens DecideDialog — which itself makes it obvious,
 * in the UI (not just via the backend's 403), that the user who requested
 * the change cannot also approve it (approvals_requester_ne_approver).
 */
export function VersionHistory({ policyId, onChanged }: { policyId: string; onChanged: () => void }) {
  const { user } = useCurrentUser();
  const versionsQuery = useQuery({
    queryKey: ['policy-versions', policyId],
    queryFn: () => fetchJson<PolicyVersionDto[]>(`/api/policies/${policyId}/versions`),
  });
  const usersQuery = useQuery({
    queryKey: ['identity-users'],
    queryFn: () => fetchJson<UserOption[]>('/api/identity-users'),
    staleTime: 5 * 60_000,
  });
  const userNameById = React.useMemo(() => new Map((usersQuery.data ?? []).map((u) => [u.id, u.fullName])), [usersQuery.data]);

  const [decideTarget, setDecideTarget] = React.useState<PolicyVersionDto | null>(null);

  if (versionsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading version history…</p>;
  if (versionsQuery.isError || !versionsQuery.data) return <p className="text-sm text-destructive">Couldn&apos;t load version history.</p>;
  if (versionsQuery.data.length === 0) return <p className="text-sm text-muted-foreground">No versions recorded yet.</p>;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Effective</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Premium impact</TableHead>
            <TableHead className="text-right">Sum insured</TableHead>
            <TableHead>Requested by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {versionsQuery.data.map((v) => {
            const isPending = v.approvalStatus === 'PENDING';
            const isSelfRequest = isPending && user?.id === v.createdById;
            return (
              <TableRow key={v.id}>
                <TableCell className="tabular-nums text-muted-foreground">{v.versionNumber}</TableCell>
                <TableCell className="font-medium text-foreground">{v.versionType}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(v.effectiveDate)}</TableCell>
                <TableCell className="max-w-[220px] truncate text-muted-foreground">{v.changeDescription ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{v.premiumImpact ? formatNaira(v.premiumImpact) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{v.sumInsuredAtVersion ? formatNaira(v.sumInsuredAtVersion) : '—'}</TableCell>
                <TableCell className="text-muted-foreground">{userNameById.get(v.createdById) ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    {v.approvalStatus ? (
                      <Badge variant={approvalStatusVariant(v.approvalStatus)}>{v.approvalStatus}</Badge>
                    ) : (
                      <Badge variant="secondary">Applied</Badge>
                    )}
                    {v.requiredApprovals && v.requiredApprovals > 1 ? (
                      <span className="text-[11px] text-muted-foreground">
                        {v.approvedCount ?? 0} of {v.requiredApprovals} approvals
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {isPending ? (
                    <div className="flex flex-col items-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDecideTarget(v)} disabled={isSelfRequest}>
                        Decide
                      </Button>
                      {isSelfRequest ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <ShieldAlert className="h-3 w-3" aria-hidden /> You requested this
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <DecideDialog
        policyId={policyId}
        version={decideTarget}
        requesterName={decideTarget ? (userNameById.get(decideTarget.createdById) ?? null) : null}
        onClose={() => setDecideTarget(null)}
        onDecided={() => {
          setDecideTarget(null);
          onChanged();
        }}
      />
    </>
  );
}

function DecideDialog({
  policyId,
  version,
  requesterName,
  onClose,
  onDecided,
}: {
  policyId: string;
  version: PolicyVersionDto | null;
  requesterName: string | null;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [decision, setDecision] = React.useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (version) {
      setDecision('APPROVED');
      setReason('');
    }
  }, [version]);

  async function submit() {
    if (!version) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/policies/${policyId}/versions/${version.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: reason || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        // 403 here is the segregation-of-duties rejection
        // (approvals_requester_ne_approver) — surfaced verbatim rather than
        // a generic failure message, since it's an expected, meaningful
        // outcome, not a bug.
        throw new Error(body?.message ?? 'Decision failed');
      }
      toast.success(decision === 'APPROVED' ? 'Approved — the policy has been updated.' : 'Rejected.');
      onDecided();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={version !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decide: {version?.versionType.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Requested by {requesterName ?? 'another user'} for {formatDate(version?.effectiveDate ?? null)}.{' '}
            {version?.requiredApprovals && version.requiredApprovals > 1 ? (
              <>
                This change needs {version.requiredApprovals} approvals ({version.approvedCount ?? 0} so far) — approving adds your
                decision; the policy only updates once enough approvals land. Rejecting stops the whole chain immediately.
              </>
            ) : (
              <>Approving applies the change to the policy immediately; rejecting leaves the policy unchanged.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="decision">Decision</Label>
            <Select value={decision} onValueChange={(v) => setDecision(v as 'APPROVED' | 'REJECTED')}>
              <SelectTrigger id="decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">Approve</SelectItem>
                <SelectItem value="REJECTED">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason (optional)</Label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant={decision === 'REJECTED' ? 'destructive' : 'default'} onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Submitting…' : decision === 'APPROVED' ? 'Approve' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

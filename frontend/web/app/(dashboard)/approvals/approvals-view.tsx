'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, UserRoundCog, X } from 'lucide-react';
import { Badge, Button, Card, CardContent, Skeleton } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { useApprovalDelegations, usePendingApprovals, useRevokeApprovalDelegation } from '../dashboard-hooks';
import { DelegationFormDialog } from './delegation-form-dialog';

const ENTITY_TYPE_LABELS: Record<string, string> = {
  CASE_CLOSURE: 'Case closure',
  KNOWLEDGE_ARTICLE_PUBLISH: 'Knowledge article',
  POLICY_ENDORSEMENT: 'Policy endorsement',
  POLICY_CANCELLATION: 'Policy cancellation',
  USER_ROLE_CHANGE: 'Role change',
  CASE_AUTOMATION_GATE: 'Workflow approval',
  DOCUMENT_RETENTION_OVERRIDE: 'Document retention',
  OPPORTUNITY_DISCOUNT: 'Discount approval',
  OTHER: 'Approval',
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ApprovalsView() {
  const { user } = useCurrentUser();
  const { data, isLoading, isError } = usePendingApprovals();

  const rows = data ?? [];
  const toDecide = rows.filter((r) => !r.isMine);
  const mine = rows.filter((r) => r.isMine);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Every pending approval across the app in one place — case closures, policy endorsements &amp; cancellations, knowledge
          articles, role changes, and workflow gates. Deciding still happens on the record itself; this is where you find it.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">Couldn&apos;t load approvals.</CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium text-foreground">Nothing waiting on you</p>
            <p className="text-sm text-muted-foreground">New approval requests will show up here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {toDecide.length > 0 ? (
            <ApprovalGroup title="Waiting on you" description="You can act on these — open the record to approve or reject." items={toDecide} />
          ) : null}
          {mine.length > 0 ? (
            <ApprovalGroup
              title="Your requests"
              description={`Submitted by you${user ? `, ${user.fullName}` : ''} — someone else needs to decide these.`}
              items={mine}
            />
          ) : null}
        </div>
      )}

      <DelegationSection currentUserId={user?.id} />
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function DelegationSection({ currentUserId }: { currentUserId: string | undefined }) {
  const { data, isLoading } = useApprovalDelegations();
  const revoke = useRevokeApprovalDelegation();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const rows = data ?? [];
  const given = rows.filter((d) => d.delegatorId === currentUserId);
  const received = rows.filter((d) => d.delegateId === currentUserId && d.delegatorId !== currentUserId);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Delegation</h2>
          <p className="text-xs text-muted-foreground">While you&apos;re out, hand your named-approver workflow gates to a colleague.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <UserRoundCog className="h-4 w-4" aria-hidden />
          Delegate my approvals
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : given.length === 0 && received.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">No delegations set up.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {given.length > 0 ? (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {given.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground">
                        To <span className="font-medium">{d.delegateName ?? 'a colleague'}</span>
                        <Badge variant={d.isActive ? 'default' : 'outline'} className="ml-2">
                          {d.isActive ? 'Active' : 'Scheduled'}
                        </Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(d.startsAt)} – {formatDate(d.endsAt)}
                        {d.note ? ` · ${d.note}` : ''}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => revoke.mutate(d.id)} disabled={revoke.isPending} aria-label="Revoke delegation">
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {received.length > 0 ? (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {received.map((d) => (
                  <div key={d.id} className="px-4 py-3">
                    <p className="text-sm text-foreground">
                      Standing in for <span className="font-medium">{d.delegatorName ?? 'a colleague'}</span>
                      <Badge variant={d.isActive ? 'default' : 'outline'} className="ml-2">
                        {d.isActive ? 'Active' : 'Scheduled'}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(d.startsAt)} – {formatDate(d.endsAt)}
                      {d.note ? ` · ${d.note}` : ''}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      <DelegationFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function ApprovalGroup({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: { id: string; entityType: string; label: string; reason: string | null; requestedByName: string | null; createdAt: string; linkPath: string | null }[];
}) {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {items.map((item) => {
            const inner = (
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{ENTITY_TYPE_LABELS[item.entityType] ?? item.entityType}</Badge>
                  </div>
                  <p className="font-medium text-foreground">{item.label}</p>
                  {item.reason ? <p className="text-sm text-muted-foreground">{item.reason}</p> : null}
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden />
                    {formatWhen(item.createdAt)}
                    {item.requestedByName ? ` · Requested by ${item.requestedByName}` : ''}
                  </p>
                </div>
              </div>
            );
            return item.linkPath ? (
              <Link key={item.id} href={item.linkPath} className="block transition-colors hover:bg-secondary/50">
                {inner}
              </Link>
            ) : (
              <div key={item.id}>{inner}</div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

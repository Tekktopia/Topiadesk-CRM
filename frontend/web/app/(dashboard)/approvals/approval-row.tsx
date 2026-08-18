import Link from 'next/link';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Badge, Card, CardContent } from '@topiadesk/ui';
import type { PendingApproval } from '../types';

export const ENTITY_TYPE_LABELS: Record<string, string> = {
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

/** No real deadline exists on Approval (see approvals.controller.ts's doc comment) — this is a heuristic off createdAt age, not a stored SLA. */
export const AGING_DAYS = 2;
export const OVERDUE_DAYS = 5;

export function ageInDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

export function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ApprovalListCard({ items, variant }: { items: PendingApproval[]; variant: 'pending' | 'history' }) {
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {items.map((item) => (
          <ApprovalRow key={item.id} item={item} variant={variant} />
        ))}
      </CardContent>
    </Card>
  );
}

function AgingBadge({ createdAt }: { createdAt: string }) {
  const days = ageInDays(createdAt);
  if (days >= OVERDUE_DAYS) return <Badge variant="destructive">Waiting {days}d</Badge>;
  if (days >= AGING_DAYS) return <Badge variant="warning">Waiting {days}d</Badge>;
  return null;
}

function ApprovalRow({ item, variant }: { item: PendingApproval; variant: 'pending' | 'history' }) {
  const inner = (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{ENTITY_TYPE_LABELS[item.entityType] ?? item.entityType}</Badge>
          {variant === 'history' ? (
            <Badge variant={item.status === 'APPROVED' ? 'success' : 'destructive'} className="gap-1">
              {item.status === 'APPROVED' ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
              {item.status === 'APPROVED' ? 'Approved' : 'Rejected'}
            </Badge>
          ) : (
            <AgingBadge createdAt={item.createdAt} />
          )}
        </div>
        <p className="truncate font-medium text-foreground">{item.label}</p>
        {item.reason ? <p className="text-sm text-muted-foreground">{item.reason}</p> : null}
        {variant === 'history' && item.decisionNote ? <p className="text-sm italic text-muted-foreground">&ldquo;{item.decisionNote}&rdquo;</p> : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            {formatWhen(item.createdAt)}
          </span>
          {item.requestedByName ? <span>Requested by {item.requestedByName}</span> : null}
          {variant === 'history' && item.decidedAt ? (
            <span>
              Decided {formatWhen(item.decidedAt)}
              {item.approvedByName ? ` by ${item.approvedByName}` : ''}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );

  return item.linkPath ? (
    <Link href={item.linkPath} className="block transition-colors hover:bg-secondary/50">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

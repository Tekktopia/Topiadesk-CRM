'use client';

import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton, UnifiedTimeline, type ActivityTimelineItem, type LogActivityFormValues } from '@topiadesk/ui';
import { EmptyState } from '../../../_components/empty-state';
import { PageHeader } from '../../../_components/page-header';
import { SlaClockRow } from '../../../_components/sla-badge';
import { WatchersPanel } from '../../../_components/watchers-panel';
import {
  caseStatusPendingDescription,
  casePriorityLabel,
  casePriorityVariant,
  caseStatusLabel,
  caseStatusVariant,
  caseTypeLabel,
} from '../../../_lib/constants';
import { formatDateTime } from '../../../_lib/format';
import { useAddComment, useCase, useCaseCategories, useCaseSlaClocks, useComments, useDirectoryUsers, usePolicyLookups } from '../../../_lib/hooks';
import type { CommentActivityDirection, CommentActivityType } from '../../../_lib/types';
import { ApplyMacroDropdown } from './apply-macro-dropdown';
import { CaseEditAction } from './case-edit-action';
import { CaseLifecycleActions } from './case-lifecycle-actions';
import { ClosureApprovalCard } from './closure-approval-card';
import { LinkMergeActions } from './link-merge-actions';

export function CaseDetailView({ caseId }: { caseId: string }) {
  const { data: kase, isLoading } = useCase(caseId);
  const { usersById } = useDirectoryUsers();
  const { accounts, policies } = usePolicyLookups();
  const { data: categories } = useCaseCategories();
  const { firstResponse, resolution, hasAccess: hasSlaAccess } = useCaseSlaClocks(kase);
  const { data: comments, isLoading: isCommentsLoading } = useComments('cases', caseId);
  const addComment = useAddComment('cases', caseId);

  const timelineItems: ActivityTimelineItem[] = (comments ?? []).map((c) => ({
    id: c.id,
    type: c.type as CommentActivityType,
    direction: c.direction as CommentActivityDirection,
    subject: c.subject,
    body: c.body,
    occurredAt: c.occurredAt,
    authorName: c.createdById ? (usersById.get(c.createdById)?.fullName ?? null) : (c.createdBySystemJob ?? null),
    emailDeliveryStatus: c.emailDeliveryStatus,
  }));

  async function handleLogActivity(values: LogActivityFormValues) {
    await addComment.mutateAsync({
      subject: values.subject,
      body: values.body || undefined,
      type: values.type,
      direction: values.direction,
      occurredAt: new Date(values.occurredAt).toISOString(),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!kase) {
    return <EmptyState title="Ticket not found" description="It may have been deleted." />;
  }

  const pendingDescription = caseStatusPendingDescription(kase.status);
  const account = kase.accountId ? accounts.find((a) => a.id === kase.accountId) : null;
  const policy = kase.policyId ? policies.find((p) => p.id === kase.policyId) : null;
  const category = kase.categoryId ? categories?.find((c) => c.id === kase.categoryId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {kase.caseNumber}
            <Badge variant={caseStatusVariant(kase.status)}>{caseStatusLabel(kase.status)}</Badge>
            <Badge variant={casePriorityVariant(kase.priority)}>{casePriorityLabel(kase.priority)}</Badge>
            <Badge variant="outline">{caseTypeLabel(kase.caseType)}</Badge>
          </span>
        }
        description={pendingDescription ?? kase.subject}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CaseEditAction kase={kase} />
            <CaseLifecycleActions kase={kase} />
            <ApplyMacroDropdown caseId={caseId} />
            <LinkMergeActions caseId={caseId} />
          </div>
        }
      />

      {pendingDescription ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning-foreground">
          {pendingDescription}
          {resolution
            ? ` — the resolution SLA clock is ${resolution.status === 'PAUSED' ? 'paused' : resolution.status.toLowerCase()} until this returns to Open.`
            : hasSlaAccess
              ? ' — this case has no resolution SLA clock configured.'
              : ' — SLA clock detail isn’t visible with your current permissions.'}
        </div>
      ) : null}

      {kase.caseType === 'COMPLAINT' ? <ClosureApprovalCard caseId={caseId} /> : null}

      {kase.slaPolicyId ? (
        <Card>
          <CardHeader>
            <CardTitle>SLA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasSlaAccess ? (
              firstResponse || resolution ? (
                <>
                  <SlaClockRow label="First response" clock={firstResponse} />
                  <SlaClockRow label="Resolution" clock={resolution} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No active SLA clocks for this case.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">SLA clock detail requires additional permissions.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Ticket details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Subject" value={kase.subject} />
          <Field label="Category" value={category?.name ?? '—'} />
          <Field label="Account" value={account?.name ?? '—'} />
          <Field label="Policy" value={policy?.name ?? '—'} />
          <Field
            label="Assigned to"
            value={kase.assignedToId ? (usersById.get(kase.assignedToId)?.fullName ?? kase.assignedToId) : 'Unassigned'}
          />
          <Field label="Source channel" value={kase.sourceChannel ?? '—'} />
          <Field label="First responded" value={formatDateTime(kase.firstRespondedAt)} />
          <Field label="Resolved at" value={formatDateTime(kase.resolvedAt)} />
          <Field label="Closed at" value={formatDateTime(kase.closedAt)} />
          {kase.description ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="text-foreground">{kase.description}</p>
            </div>
          ) : null}
          {kase.resolutionNotes ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolution notes</p>
              <p className="text-foreground">{kase.resolutionNotes}</p>
            </div>
          ) : null}
          {kase.parentCaseId ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {kase.linkType === 'MERGED' ? 'Merged into' : 'Parent case'}
              </p>
              <Link href={`/cases/${kase.parentCaseId}`} className="text-primary hover:underline">
                View case
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <UnifiedTimeline
              entityType="cases"
              entityId={caseId}
              activityItems={timelineItems}
              isActivityLoading={isCommentsLoading}
              onLogActivity={handleLogActivity}
              isLogging={addComment.isPending}
              emptyMessage="No comments or history recorded yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Watchers</CardTitle>
          </CardHeader>
          <CardContent>
            <WatchersPanel entity="cases" entityId={caseId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

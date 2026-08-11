'use client';

import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton, UnifiedTimeline, type ActivityTimelineItem, type LogActivityFormValues } from '@topiadesk/ui';
import { EmptyState } from '../../../_components/empty-state';
import { PageHeader } from '../../../_components/page-header';
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
import { CaseProcessTracker } from './case-process-tracker';
import { CaseRelatedTicketsTable } from './case-related-tickets-table';
import { CaseTasksTable } from './case-tasks-table';
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
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {kase.caseNumber}
            <Badge variant={caseStatusVariant(kase.status)}>{caseStatusLabel(kase.status)}</Badge>
            <Badge variant={casePriorityVariant(kase.priority)}>{casePriorityLabel(kase.priority)}</Badge>
            <Badge variant="outline">{caseTypeLabel(kase.caseType)}</Badge>
          </span>
        }
        description={kase.subject}
      />

      {/* Ribbon — the same 4 real actions the page has always had, presented
          as a compact toolbar row instead of stacked in the header. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <CaseEditAction kase={kase} />
        <CaseLifecycleActions kase={kase} />
        <ApplyMacroDropdown caseId={caseId} />
        <LinkMergeActions caseId={caseId} />
      </div>

      <CaseProcessTracker kase={kase} firstResponse={firstResponse} resolution={resolution} hasSlaAccess={hasSlaAccess} />

      {pendingDescription ? (
        <div className="border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning-foreground">{pendingDescription}</div>
      ) : null}

      {kase.caseType === 'COMPLAINT' ? <ClosureApprovalCard caseId={caseId} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ticket details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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

          {kase.description || kase.resolutionNotes ? (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {kase.description ? <p className="text-foreground">{kase.description}</p> : null}
                {kase.resolutionNotes ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolution notes</p>
                    <p className="text-foreground">{kase.resolutionNotes}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
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
              historyFetchUrl={`/api/cases/${caseId}/history`}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <CaseTasksTable caseId={caseId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Related tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <CaseRelatedTicketsTable caseId={caseId} />
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

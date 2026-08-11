'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle, RecordHistory, Skeleton } from '@topiadesk/ui';
import { CommentsSection } from '../../../_components/comments-section';
import { EmptyState } from '../../../_components/empty-state';
import { PageHeader } from '../../../_components/page-header';
import { SlaClockRow } from '../../../_components/sla-badge';
import { WatchersPanel } from '../../../_components/watchers-panel';
import { casePriorityLabel, casePriorityVariant, claimStatusLabel, claimStatusVariant, humanize } from '../../../_lib/constants';
import { formatCurrency, formatDate, formatDateTime } from '../../../_lib/format';
import { useClaim, useClaimSlaClocks, useClaimStatusHistory, useDirectoryUsers, useLossCauseCategories } from '../../../_lib/hooks';
import { ApplyMacroDropdown } from './apply-macro-dropdown';
import { ClaimEditAction } from './claim-edit-action';
import { ClaimLifecycleActions } from './claim-lifecycle-actions';

export function ClaimDetailView({ claimId }: { claimId: string }) {
  const { data: claim, isLoading } = useClaim(claimId);
  const { usersById } = useDirectoryUsers();
  const { data: lossCauseCategories } = useLossCauseCategories();
  const { currentStage, currentStageFromStatus, hasAccess: hasSlaAccess } = useClaimSlaClocks(claim);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!claim) {
    return <EmptyState title="Claim not found" description="It may have been deleted." />;
  }

  const category = claim.causeOfLossCategoryId ? lossCauseCategories?.find((c) => c.id === claim.causeOfLossCategoryId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {claim.claimNumber}
            <Badge variant={claimStatusVariant(claim.status)}>{claimStatusLabel(claim.status)}</Badge>
            <Badge variant={casePriorityVariant(claim.priority)}>{casePriorityLabel(claim.priority)}</Badge>
          </span>
        }
        description={claim.reopenCount > 0 ? `Reopened ${claim.reopenCount} time${claim.reopenCount === 1 ? '' : 's'}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ApplyMacroDropdown claimId={claim.id} />
            <ClaimEditAction claim={claim} />
            <ClaimLifecycleActions claim={claim} />
          </div>
        }
      />

      {claim.slaPolicyId ? (
        <Card>
          <CardHeader>
            <CardTitle>SLA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasSlaAccess ? (
              currentStage ? (
                <SlaClockRow label={currentStageFromStatus ? `Stage: ${humanize(currentStageFromStatus)}` : 'Current stage'} clock={currentStage} />
              ) : (
                <p className="text-sm text-muted-foreground">No active SLA clock for this claim.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">SLA clock detail requires additional permissions.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Claim details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Date of loss" value={formatDate(claim.dateOfLoss)} />
          <Field label="Date reported" value={formatDate(claim.dateReported)} />
          <Field label="Cause of loss" value={claim.causeOfLoss ?? '—'} />
          <Field label="Loss cause category" value={category?.name ?? '—'} />
          <Field label="Reserve amount" value={formatCurrency(claim.reserveAmount)} />
          <Field label="Settled amount" value={formatCurrency(claim.settledAmount)} />
          {claim.settledAt ? <Field label="Settled at" value={formatDateTime(claim.settledAt)} /> : null}
          {claim.repudiationReason ? <Field label="Repudiation reason" value={claim.repudiationReason} /> : null}
          <Field label="Adjuster" value={claim.adjusterId ? (usersById.get(claim.adjusterId)?.fullName ?? claim.adjusterId) : 'Unassigned'} />
          {claim.externalAdjusterRef ? <Field label="External adjuster ref" value={claim.externalAdjusterRef} /> : null}
        </CardContent>
      </Card>

      <StatusHistoryCard claimId={claimId} />

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <RecordHistory entityType="claims" entityId={claimId} fetchUrl={`/api/claims/${claimId}/history`} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Comments</CardTitle>
          </CardHeader>
          <CardContent>
            <CommentsSection entity="claims" entityId={claimId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Watchers</CardTitle>
          </CardHeader>
          <CardContent>
            <WatchersPanel entity="claims" entityId={claimId} />
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

function StatusHistoryCard({ claimId }: { claimId: string }) {
  const { data, isLoading } = useClaimStatusHistory(claimId);
  const { usersById } = useDirectoryUsers();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status history</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No status changes yet" />
        ) : (
          <ol className="relative space-y-0 border-l border-border pl-6">
            {data.map((entry) => (
              <li key={entry.id} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[25px] h-3 w-3 rounded-none border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {entry.fromStatus ? <span className="text-muted-foreground">{humanize(entry.fromStatus)} →</span> : null}
                  <span className="font-medium text-foreground">{humanize(entry.toStatus)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
                  {entry.changedById ? ` · ${usersById.get(entry.changedById)?.fullName ?? entry.changedById}` : ''}
                </p>
                {entry.reason ? <p className="mt-1 text-sm text-foreground/90">{entry.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

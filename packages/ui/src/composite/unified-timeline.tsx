'use client';

import { cn } from '../lib/utils';
import { Skeleton } from '../primitives/skeleton';
import { ActivityLogComposer, ActivityTimelineRow, type ActivityTimelineItem, type LogActivityFormValues } from './activity-timeline';
import { RecordHistoryRow, useRecordHistory } from './record-history';

/**
 * `packages/ui/src/composite/unified-timeline.tsx` — merges a record's
 * Activity/Comment log (caller-fetched, same `items` contract
 * ActivityTimeline takes) with its audit-trail change history
 * (self-fetched via useRecordHistory, same as RecordHistory) into one
 * chronological list, built for Case detail's "Timeline" card (design gap
 * g in the ticketing-robustness pass).
 *
 * Deliberately a CLIENT-SIDE merge of two independent fetches, not a new
 * backend endpoint: `activity:read` (front-line brokers get this) and the
 * audit half's own access tier are resolved separately. Pass
 * `historyFetchUrl` (see RecordHistoryProps.fetchUrl) to point the audit
 * half at a per-record `:id/history` endpoint — open to anyone who can
 * read the record — instead of the ADMIN/COMPLIANCE_OFFICER-only default.
 * Either way this always renders the activity items (the primary,
 * most-agents-can-see data) and quietly folds in audit rows only when
 * useRecordHistory actually returns them — a 403 (or any other fetch
 * error) on the audit half degrades to "no audit rows shown," same as
 * RecordHistory's own graceful 403 handling, rather than an error blocking
 * the activity half too.
 *
 * Built generically (entityType/entityId are plain strings, same as
 * RecordHistoryProps) so other entity detail pages can adopt this later —
 * only Case is wired in this pass (case-detail-view.tsx).
 */
export interface UnifiedTimelineProps {
  entityType: string;
  entityId: string;
  activityItems: ActivityTimelineItem[];
  isActivityLoading?: boolean;
  onLogActivity?: (values: LogActivityFormValues) => void | Promise<void>;
  isLogging?: boolean;
  /** Max audit rows to fetch — see RecordHistoryProps.take. */
  historyTake?: number;
  /** Overrides the default `/api/admin/audit-log` fetch for the audit half — see RecordHistoryProps.fetchUrl. */
  historyFetchUrl?: string;
  emptyMessage?: string;
  className?: string;
}

type MergedRow =
  | { kind: 'activity'; occurredAtMs: number; item: ActivityTimelineItem }
  | { kind: 'audit'; occurredAtMs: number; entryId: string; entry: Parameters<typeof RecordHistoryRow>[0]['entry'] };

export function UnifiedTimeline({
  entityType,
  entityId,
  activityItems,
  isActivityLoading = false,
  onLogActivity,
  isLogging = false,
  historyTake = 50,
  historyFetchUrl,
  emptyMessage = 'No activity or history recorded yet.',
  className,
}: UnifiedTimelineProps) {
  const historyQuery = useRecordHistory(entityType, entityId, historyTake, historyFetchUrl);
  const auditEntries = historyQuery.isError ? [] : (historyQuery.data ?? []);

  const merged: MergedRow[] = [
    ...activityItems.map(
      (item): MergedRow => ({
        kind: 'activity',
        occurredAtMs: new Date(item.occurredAt).getTime(),
        item,
      }),
    ),
    ...auditEntries.map(
      (entry): MergedRow => ({
        kind: 'audit',
        occurredAtMs: new Date(entry.createdAt).getTime(),
        entryId: entry.id,
        entry,
      }),
    ),
  ].sort((a, b) => b.occurredAtMs - a.occurredAtMs);

  const isLoading = isActivityLoading || historyQuery.isLoading;

  return (
    <div className={cn('space-y-6', className)}>
      {onLogActivity ? <ActivityLogComposer onLogActivity={onLogActivity} isLogging={isLogging} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : merged.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ol className="relative space-y-0 border-l border-border pl-6">
          {merged.map((row) =>
            row.kind === 'activity' ? (
              <ActivityTimelineRow key={`activity-${row.item.id}`} item={row.item} />
            ) : (
              <RecordHistoryRow key={`audit-${row.entryId}`} entry={row.entry} />
            ),
          )}
        </ol>
      )}
    </div>
  );
}

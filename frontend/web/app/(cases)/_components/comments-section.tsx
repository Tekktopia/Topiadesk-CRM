'use client';

import { ActivityTimeline, type ActivityTimelineItem, type LogActivityFormValues } from '@topiadesk/ui';
import { useAddComment, useComments, useDirectoryUsers } from '../_lib/hooks';
import type { CommentActivityDirection, CommentActivityType } from '../_lib/types';

/**
 * Comment thread for a Claim or Case detail page. Comment/note threading
 * reuses Activity (claimId/caseId, direction: INTERNAL for internal notes —
 * see backend/api/.../dto/comment.dto.ts's header comment) rather than a
 * dedicated CaseComment table, so this reuses packages/ui's
 * ActivityTimeline composite exactly as app/(crm)/leads/[id]'s ActivityLog
 * does, just backed by /api/claims|cases/:id/comments instead of
 * /api/crm/activities.
 */
export function CommentsSection({ entity, entityId }: { entity: 'claims' | 'cases'; entityId: string }) {
  const { data, isLoading } = useComments(entity, entityId);
  const { usersById } = useDirectoryUsers();
  const addComment = useAddComment(entity, entityId);

  const items: ActivityTimelineItem[] = (data ?? []).map((c) => ({
    id: c.id,
    type: c.type as CommentActivityType,
    direction: c.direction as CommentActivityDirection,
    subject: c.subject,
    body: c.body,
    occurredAt: c.occurredAt,
    authorName: c.createdById ? (usersById.get(c.createdById)?.fullName ?? null) : (c.createdBySystemJob ?? null),
    emailDeliveryStatus: c.emailDeliveryStatus,
    emailTo: c.emailTo,
    emailCc: c.emailCc,
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

  return (
    <ActivityTimeline
      items={items}
      isLoading={isLoading}
      onLogActivity={handleLogActivity}
      isLogging={addComment.isPending}
      emptyMessage="No comments yet."
    />
  );
}

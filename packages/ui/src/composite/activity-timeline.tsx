'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import {
  MessageSquareText,
  Mail,
  MessagesSquare,
  Phone,
  MessageCircle,
  StickyNote,
  Users,
  Loader2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { Label } from '../primitives/label';
import { Skeleton } from '../primitives/skeleton';

/**
 * `packages/ui/src/composite/activity-timeline.tsx` — a reusable
 * interaction-log timeline + "log an activity" form, shared by the CRM
 * module's Account/Lead/Opportunity detail pages (each of those owns its
 * own data fetching via TanStack Query against its own BFF route and just
 * passes `items`/`onLogActivity` down — this component has no knowledge of
 * app/(crm)/**'s routes or of `@topiadesk/shared-types`, keeping it usable
 * from any future entity detail page the same way `StatTile` is).
 *
 * The activity type/direction enums are hand-mirrored from
 * packages/db/prisma/schema.prisma (ActivityType/ActivityDirection) — same
 * "keep in sync manually" convention as packages/shared-types/src/enums.ts,
 * necessary here because this package doesn't depend on @topiadesk/shared-types.
 */

export const ACTIVITY_TIMELINE_TYPES = [
  'CALL',
  'EMAIL',
  'MEETING',
  'NOTE',
  'WHATSAPP',
  'PORTAL_MESSAGE',
  'SMS',
] as const;
export type ActivityTimelineType = (typeof ACTIVITY_TIMELINE_TYPES)[number];

export const ACTIVITY_TIMELINE_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'INTERNAL'] as const;
export type ActivityTimelineDirection = (typeof ACTIVITY_TIMELINE_DIRECTIONS)[number];

// Mirrors Activity.aiSentiment (packages/db/prisma/schema.prisma) and the
// AI Gateway's POST /ai/sentiment response label — see
// backend/api/src/modules/ai-gateway/dto/sentiment-request.dto.ts.
export const ACTIVITY_TIMELINE_SENTIMENTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;
export type ActivityTimelineSentiment = (typeof ACTIVITY_TIMELINE_SENTIMENTS)[number];

export interface ActivityTimelineItem {
  id: string;
  type: ActivityTimelineType;
  direction: ActivityTimelineDirection;
  subject: string;
  body?: string | null;
  occurredAt: string | Date;
  durationMinutes?: number | null;
  outcome?: string | null;
  /** Display name of who logged it, if the caller has one to hand. */
  authorName?: string | null;
  /**
   * Advisory AI sentiment for this item's text, if it's been analyzed —
   * omit or leave null/undefined when no analysis has happened yet (the
   * normal case: nothing in this codebase populates this automatically,
   * every AI Gateway call is a human-triggered, advisory-only suggestion —
   * see ai-gateway.service.ts's class-level comment). Purely additive:
   * existing callers that never pass this render exactly as before.
   */
  aiSentiment?: ActivityTimelineSentiment | null;
  /** Sentiment polarity, -1 (very negative) to 1 (very positive), alongside `aiSentiment`. */
  aiSentimentScore?: number | null;
  /** Mirrors Activity.emailDeliveryStatus (schema.prisma) — only ever set for OUTBOUND Case comments. Omit/null for everything else, same "purely additive" convention as aiSentiment above. */
  emailDeliveryStatus?: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED_NO_EMAIL' | null;
}

export interface LogActivityFormValues {
  type: ActivityTimelineType;
  direction: ActivityTimelineDirection;
  subject: string;
  body: string;
  /** `datetime-local` input value, e.g. "2026-08-01T14:30". */
  occurredAt: string;
  durationMinutes: string;
  outcome: string;
}

export interface ActivityTimelineProps {
  items: ActivityTimelineItem[];
  isLoading?: boolean;
  /** Omit to render the timeline read-only, with no log-activity form. */
  onLogActivity?: (values: LogActivityFormValues) => void | Promise<void>;
  isLogging?: boolean;
  emptyMessage?: string;
  className?: string;
}

const TYPE_ICON: Record<ActivityTimelineType, React.ComponentType<{ className?: string }>> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Users,
  NOTE: StickyNote,
  WHATSAPP: MessageCircle,
  PORTAL_MESSAGE: MessagesSquare,
  SMS: MessageSquareText,
};

const TYPE_LABEL: Record<ActivityTimelineType, string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  NOTE: 'Note',
  WHATSAPP: 'WhatsApp',
  PORTAL_MESSAGE: 'Portal message',
  SMS: 'SMS',
};

const DIRECTION_LABEL: Record<ActivityTimelineDirection, string> = {
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
  INTERNAL: 'Internal',
};

const SENTIMENT_LABEL: Record<ActivityTimelineSentiment, string> = {
  POSITIVE: 'Positive',
  NEUTRAL: 'Neutral',
  NEGATIVE: 'Negative',
};

const SENTIMENT_BADGE_VARIANT: Record<ActivityTimelineSentiment, 'success' | 'secondary' | 'destructive'> = {
  POSITIVE: 'success',
  NEUTRAL: 'secondary',
  NEGATIVE: 'destructive',
};

const EMAIL_DELIVERY_LABEL: Record<NonNullable<ActivityTimelineItem['emailDeliveryStatus']>, string> = {
  PENDING: 'Sending…',
  SENT: 'Emailed',
  FAILED: 'Email failed',
  SKIPPED_NO_EMAIL: 'No email on file',
};

const EMAIL_DELIVERY_BADGE_VARIANT: Record<NonNullable<ActivityTimelineItem['emailDeliveryStatus']>, 'success' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  SENT: 'success',
  FAILED: 'destructive',
  SKIPPED_NO_EMAIL: 'outline',
};

const dateTimeFormatter = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

function formatOccurredAt(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

/** Local input[type=datetime-local] value for "now", in the viewer's timezone. */
function nowForDateTimeLocal(): string {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

const DEFAULT_FORM_VALUES: LogActivityFormValues = {
  type: 'NOTE',
  direction: 'OUTBOUND',
  subject: '',
  body: '',
  occurredAt: '',
  durationMinutes: '',
  outcome: '',
};

/**
 * The "log an activity" form, extracted so UnifiedTimeline (unified-timeline.tsx)
 * can render the same composer above its merged Activity+Audit list without
 * duplicating this markup — ActivityTimeline below is just this plus its own
 * activity-only list.
 */
export function ActivityLogComposer({
  onLogActivity,
  isLogging = false,
}: {
  onLogActivity: (values: LogActivityFormValues) => void | Promise<void>;
  isLogging?: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LogActivityFormValues>({ defaultValues: DEFAULT_FORM_VALUES });

  const submit = handleSubmit(async (values) => {
    await onLogActivity(values);
    reset(DEFAULT_FORM_VALUES);
  });

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg bg-card p-4 shadow-brand-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="activity-type">Type</Label>
          <select
            id="activity-type"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-brand-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            {...register('type', { required: true })}
          >
            {ACTIVITY_TIMELINE_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="activity-direction">Direction</Label>
          <select
            id="activity-direction"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-brand-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            {...register('direction', { required: true })}
          >
            {ACTIVITY_TIMELINE_DIRECTIONS.map((direction) => (
              <option key={direction} value={direction}>
                {DIRECTION_LABEL[direction]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="activity-subject">Subject</Label>
        <Input
          id="activity-subject"
          placeholder="e.g. Called to discuss renewal terms"
          aria-invalid={Boolean(errors.subject)}
          {...register('subject', { required: true, minLength: 1 })}
        />
        {errors.subject ? <p className="text-sm font-medium text-destructive">Subject is required.</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="activity-body">Notes</Label>
        <textarea
          id="activity-body"
          rows={2}
          placeholder="Optional details…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          {...register('body')}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="activity-occurred-at">When</Label>
          <Input id="activity-occurred-at" type="datetime-local" {...register('occurredAt')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="activity-duration">Duration (min)</Label>
          <Input id="activity-duration" type="number" min={0} placeholder="—" {...register('durationMinutes')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="activity-outcome">Outcome</Label>
          <Input id="activity-outcome" placeholder="e.g. Left voicemail" {...register('outcome')} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isLogging}>
          {isLogging ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Log activity
        </Button>
      </div>
    </form>
  );
}

/** One activity row's markup, extracted so UnifiedTimeline can interleave it with RecordHistoryRow (record-history.tsx) inside one merged `<ol>` — must render as a bare `<li>` (no wrapping list) so it drops into either caller's list unchanged. */
export function ActivityTimelineRow({ item }: { item: ActivityTimelineItem }) {
  const Icon = TYPE_ICON[item.type];
  return (
    <li className="relative pb-6 last:pb-0">
      <span className="absolute -left-[29px] flex h-6 w-6 items-center justify-center rounded-none border border-border bg-background text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{item.subject}</span>
        <Badge variant="outline">{TYPE_LABEL[item.type]}</Badge>
        <Badge variant="secondary">{DIRECTION_LABEL[item.direction]}</Badge>
        {item.aiSentiment ? (
          <Badge variant={SENTIMENT_BADGE_VARIANT[item.aiSentiment]}>{SENTIMENT_LABEL[item.aiSentiment]}</Badge>
        ) : null}
        {item.emailDeliveryStatus ? (
          <Badge variant={EMAIL_DELIVERY_BADGE_VARIANT[item.emailDeliveryStatus]}>
            {EMAIL_DELIVERY_LABEL[item.emailDeliveryStatus]}
          </Badge>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {formatOccurredAt(item.occurredAt)}
        {item.authorName ? ` · ${item.authorName}` : ''}
        {item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}
      </p>
      {item.body ? <p className="mt-1.5 text-sm text-foreground/90">{item.body}</p> : null}
      {item.outcome ? <p className="mt-1 text-xs text-muted-foreground">Outcome: {item.outcome}</p> : null}
    </li>
  );
}

function ActivityTimeline({
  items,
  isLoading = false,
  onLogActivity,
  isLogging = false,
  emptyMessage = 'No activity logged yet.',
  className,
}: ActivityTimelineProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {onLogActivity ? <ActivityLogComposer onLogActivity={onLogActivity} isLogging={isLogging} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <ol className="relative space-y-0 border-l border-border pl-6">
          {items.map((item) => (
            <ActivityTimelineRow key={item.id} item={item} />
          ))}
        </ol>
      )}
    </div>
  );
}

export { ActivityTimeline };

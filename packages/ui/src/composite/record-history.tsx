'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, LogIn, LogOut, Pencil, Plus, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';
import { Skeleton } from '../primitives/skeleton';

/**
 * `packages/ui/src/composite/record-history.tsx` — a per-record "who
 * changed what, when" timeline (the Zendesk/Freshdesk-style change log),
 * built on top of TopiaDesk's existing hash-chained `audit_log` rather than
 * a new feature: it just fetches `GET /audit-log?entityType=&entityId=` (via
 * the same-origin `/api/admin/audit-log` BFF proxy every consumer app
 * already ships — see app/api/admin/audit-log/route.ts) and renders it. Same
 * "no knowledge of app/(crm)/**'s routes" independence as ActivityTimeline;
 * unlike that component this one owns its own fetch (via TanStack Query)
 * instead of taking `items` as a prop, per this component's brief.
 *
 * Access control: the backend's audit-log endpoint is deliberately
 * restricted (`@RequirePermission('audit_log', 'read')` — ADMIN/
 * COMPLIANCE_OFFICER only, see backend/api/src/modules/audit/
 * audit-log.controller.ts's header comment). This component does not
 * attempt to duplicate that check — it simply calls the endpoint and
 * renders whatever comes back, including a clean access-denied message on
 * 403 instead of an error toast or thrown query. That mirrors the
 * established "always show the section, gate the content" convention this
 * codebase already uses for permission-sensitive panels (see
 * app/(cases)/_lib/hooks.ts's useCaseSlaClocks/useClaimSlaClocks
 * `hasAccess: !policyQuery.isError` pattern) — callers are free to also
 * pre-emptively hide the whole tab/section for known-unprivileged roles if
 * that fits their page's existing gating pattern better; both are correct
 * because the real enforcement is server-side either way.
 */

// Hand-mirrored from packages/db/prisma/schema.prisma's AuditAction enum —
// same "keep in sync manually" convention as e.g. the admin Audit Log
// page's AUDIT_ACTIONS constant.
export const RECORD_HISTORY_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGIN_FAILED',
  'PERMISSION_CHANGE',
  'EXPORT',
  'VIEW_SENSITIVE',
  'FORCE_LOGOUT',
] as const;
export type RecordHistoryAction = (typeof RECORD_HISTORY_ACTIONS)[number];

export interface RecordHistoryActor {
  id: string;
  fullName: string;
  email: string;
}

/** Mirrors backend/api's AuditLogResponseDto. */
export interface RecordHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: RecordHistoryAction;
  actorUserId: string | null;
  actorUser: RecordHistoryActor | null;
  actorSystemJob: string | null;
  actorIp: string | null;
  /** Trigger-captured column diff — `{col: {old, new}}` for UPDATE rows, a
   * full-row snapshot for CREATE/DELETE rows. Shape isn't guaranteed beyond
   * that (varies by entityType), hence `unknown` here too. */
  changedFields: unknown;
  createdAt: string;
}

export interface RecordHistoryProps {
  entityType: string;
  entityId: string;
  /** Max rows to fetch — this is a single-record timeline, not a paginated
   * list, so a generous default is fine; pass lower for a compact widget. */
  take?: number;
  className?: string;
}

class RecordHistoryFetchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchRecordHistory(entityType: string, entityId: string, take: number): Promise<RecordHistoryEntry[]> {
  const params = new URLSearchParams({ entityType, entityId, take: String(take), skip: '0' });
  const res = await fetch(`/api/admin/audit-log?${params.toString()}`, { credentials: 'same-origin' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = res.statusText || `Request failed (${res.status})`;
    if (text) {
      try {
        const body: unknown = JSON.parse(text);
        if (body && typeof body === 'object' && 'message' in body) {
          const m = (body as { message: unknown }).message;
          message = Array.isArray(m) ? m.join(', ') : typeof m === 'string' ? m : message;
        }
      } catch {
        // Non-JSON error body — fall back to statusText.
      }
    }
    throw new RecordHistoryFetchError(res.status, message);
  }
  return res.json() as Promise<RecordHistoryEntry[]>;
}

const ACTION_ICON: Record<RecordHistoryAction, React.ComponentType<{ className?: string }>> = {
  CREATE: Plus,
  UPDATE: Pencil,
  DELETE: Trash2,
  LOGIN: LogIn,
  LOGIN_FAILED: XCircle,
  PERMISSION_CHANGE: ShieldAlert,
  EXPORT: Download,
  VIEW_SENSITIVE: Eye,
  FORCE_LOGOUT: LogOut,
};

const ACTION_BADGE_VARIANT: Record<RecordHistoryAction, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'destructive',
  LOGIN: 'secondary',
  LOGIN_FAILED: 'destructive',
  PERMISSION_CHANGE: 'warning',
  EXPORT: 'outline',
  VIEW_SENSITIVE: 'outline',
  // Mutates Keycloak-side session state, same "identity-admin action, not a
  // CRUD mutation" grouping as PERMISSION_CHANGE.
  FORCE_LOGOUT: 'warning',
};

const dateTimeFormatter = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isDiffShaped(value: unknown): value is { old?: unknown; new?: unknown } {
  return !!value && typeof value === 'object' && !Array.isArray(value) && ('old' in (value as object) || 'new' in (value as object));
}

/** Readable rendering of one audit row's `changedFields`: each top-level key
 * on its own line, "old → new" for the UPDATE trigger's diff shape or just
 * the value for the CREATE/DELETE trigger's full-row-snapshot shape. Falls
 * back to a collapsible raw-JSON block for any shape this can't confidently
 * flatten (arrays, primitives, or a future trigger payload shape) so
 * nothing is ever silently dropped. */
function ChangedFieldsView({ changedFields }: { changedFields: unknown }) {
  const isPlainObject = !!changedFields && typeof changedFields === 'object' && !Array.isArray(changedFields);

  if (!isPlainObject) {
    if (changedFields === null || changedFields === undefined) return null;
    return <RawChangedFields value={changedFields} />;
  }

  const entries = Object.entries(changedFields as Record<string, unknown>);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-0.5">
      {entries.map(([key, value]) => (
        <p key={key} className="text-sm text-foreground/90">
          <span className="font-medium text-foreground">{key}</span>
          {': '}
          {isDiffShaped(value) ? (
            <>
              <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                {formatScalar((value as { old?: unknown }).old)}
              </span>
              {' → '}
              <span>{formatScalar((value as { new?: unknown }).new)}</span>
            </>
          ) : (
            <span>{formatScalar(value)}</span>
          )}
        </p>
      ))}
    </div>
  );
}

function RawChangedFields({ value }: { value: unknown }) {
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Raw change data</summary>
      <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function RecordHistory({ entityType, entityId, take = 50, className }: RecordHistoryProps) {
  const query = useQuery({
    queryKey: ['record-history', entityType, entityId, take],
    queryFn: () => fetchRecordHistory(entityType, entityId, take),
    enabled: Boolean(entityType && entityId),
    // Same "don't retry a 403 three times" convention as
    // app/(cases)/_lib/hooks.ts's useSlaPolicy — a caller without
    // audit_log:read gets exactly one request, not a retry storm.
    retry: false,
    throwOnError: false,
  });

  if (query.isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (query.isError) {
    const status = query.error instanceof RecordHistoryFetchError ? query.error.status : undefined;
    if (status === 403) {
      return (
        <p className={cn('rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground', className)}>
          You don&apos;t have permission to view change history for this record.
        </p>
      );
    }
    return (
      <p className={cn('rounded-lg border border-dashed border-destructive/40 p-6 text-center text-sm text-destructive', className)}>
        Couldn&apos;t load change history.
      </p>
    );
  }

  const entries = query.data ?? [];

  if (entries.length === 0) {
    return (
      <p className={cn('rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground', className)}>
        No changes recorded yet.
      </p>
    );
  }

  return (
    <ol className={cn('relative space-y-0 border-l border-border pl-6', className)}>
      {entries.map((entry) => {
        const Icon = ACTION_ICON[entry.action] ?? Pencil;
        return (
          <li key={entry.id} className="relative pb-6 last:pb-0">
            <span className="absolute -left-[29px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {entry.actorUser?.fullName ?? entry.actorSystemJob ?? 'System'}
              </span>
              <Badge variant={ACTION_BADGE_VARIANT[entry.action] ?? 'outline'}>{entry.action}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatTimestamp(entry.createdAt)}
              {entry.actorUser?.email ? ` · ${entry.actorUser.email}` : ''}
            </p>
            <ChangedFieldsView changedFields={entry.changedFields} />
          </li>
        );
      })}
    </ol>
  );
}

export { RecordHistory };

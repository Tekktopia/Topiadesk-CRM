'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@topiadesk/ui';
import { AuditActionBadge } from '../_components/status-badge';
import type { AuditLogDto } from '../_lib/types';

/** "first_name" -> "First name" — raw Postgres column names, prettified just enough to read without a per-table label map (50+ audited tables, see 002_audit_chain_triggers.sql's array). */
function prettifyFieldName(key: string): string {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Primitives render as plain text; objects/arrays (e.g. a JSON column like DataSubjectRequest.exportData, or an UPDATE diff's own old/new wrapper if it's itself non-primitive) fall back to a compact inline JSON snippet rather than one unreadable page-wide blob. */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function isUpdateDiffShape(changedFields: Record<string, unknown>): changedFields is Record<string, { old: unknown; new: unknown }> {
  const values = Object.values(changedFields);
  return values.length > 0 && values.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v) && 'old' in v && 'new' in v);
}

/** Renders `changedFields` as a readable field table instead of a raw JSON dump — CREATE/DELETE and non-row-mutation events (LOGIN, PERMISSION_CHANGE, etc.) are a flat {field: value} object (the whole row, or whatever AuditService.recordEvent was called with); UPDATE is {field: {old, new}} (only the columns that actually changed, per audit_capture_row_change()'s trigger SQL). */
function ChangedFieldsView({ changedFields }: { changedFields: unknown }) {
  const [showRaw, setShowRaw] = useState(false);

  if (!changedFields || typeof changedFields !== 'object' || Array.isArray(changedFields) || Object.keys(changedFields).length === 0) {
    return <p className="text-sm text-muted-foreground">No field-level detail recorded for this entry.</p>;
  }

  const fields = changedFields as Record<string, unknown>;
  const isDiff = isUpdateDiffShape(fields);
  const entries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Field</th>
              {isDiff ? (
                <>
                  <th className="px-3 py-2 text-left font-medium">Old value</th>
                  <th className="px-3 py-2 text-left font-medium">New value</th>
                </>
              ) : (
                <th className="px-3 py-2 text-left font-medium">Value</th>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key} className="border-t border-border">
                <td className="px-3 py-2 align-top font-medium text-foreground">{prettifyFieldName(key)}</td>
                {isDiff ? (
                  <>
                    <td className="max-w-[220px] break-words px-3 py-2 align-top text-muted-foreground">
                      {formatCellValue((value as { old: unknown }).old)}
                    </td>
                    <td className="max-w-[220px] break-words px-3 py-2 align-top text-foreground">
                      {formatCellValue((value as { new: unknown }).new)}
                    </td>
                  </>
                ) : (
                  <td className="max-w-[320px] break-words px-3 py-2 align-top text-foreground">{formatCellValue(value)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => setShowRaw((v) => !v)}
      >
        {showRaw ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
        {showRaw ? 'Hide raw JSON' : 'View raw JSON'}
      </button>
      {showRaw ? (
        <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
          {JSON.stringify(changedFields, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/** Read-only view of one audit_log row — no separate detail fetch, the row
 * data is already in hand from the list query (see AuditLogController.list,
 * which returns full rows, not a summary projection). prevHash/currentHash/
 * chainLane surface the hash-chain fields the immutability guarantee
 * actually rests on. */
export function AuditLogDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: AuditLogDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Audit entry #{entry?.id}
            {entry ? <AuditActionBadge action={entry.action} /> : null}
          </DialogTitle>
          <DialogDescription>
            {entry ? `${entry.entityType} · ${entry.entityId}` : null}
          </DialogDescription>
        </DialogHeader>

        {entry ? (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">Timestamp</dt>
              <dd className="text-foreground">{new Date(entry.createdAt).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Actor</dt>
              <dd className="text-foreground">
                {entry.actorUser ? `${entry.actorUser.fullName} (${entry.actorUser.email})` : (entry.actorSystemJob ?? '—')}
              </dd>
              <dt className="text-muted-foreground">Actor IP</dt>
              <dd className="font-mono text-xs text-foreground">{entry.actorIp ?? '—'}</dd>
              <dt className="text-muted-foreground">Chain lane</dt>
              <dd className="text-foreground">{entry.chainLane}</dd>
              <dt className="text-muted-foreground">Prev hash</dt>
              <dd className="break-all font-mono text-xs text-foreground">{entry.prevHash ?? '(genesis of lane)'}</dd>
              <dt className="text-muted-foreground">Current hash</dt>
              <dd className="break-all font-mono text-xs text-foreground">{entry.currentHash}</dd>
            </dl>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">What changed</p>
              <ChangedFieldsView changedFields={entry.changedFields} />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

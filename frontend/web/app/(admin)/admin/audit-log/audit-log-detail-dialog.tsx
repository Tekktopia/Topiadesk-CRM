'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@topiadesk/ui';
import { AuditActionBadge } from '../_components/status-badge';
import type { AuditLogDto } from '../_lib/types';

/** Read-only view of one audit_log row — no separate detail fetch, the row
 * data is already in hand from the list query (see AuditLogController.list,
 * which returns full rows, not a summary projection). `changedFields` is
 * the trigger-captured column diff (shape varies by entityType, hence
 * `unknown` in the DTO); prevHash/currentHash/chainLane surface the
 * hash-chain fields the immutability guarantee actually rests on. */
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
              <p className="text-xs font-medium text-muted-foreground">Changed fields (raw)</p>
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
                {JSON.stringify(entry.changedFields ?? null, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

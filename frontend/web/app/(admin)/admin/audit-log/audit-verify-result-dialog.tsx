'use client';

import { Badge, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@topiadesk/ui';
import type { AuditVerifyResponseDto } from '../_lib/types';

/** Shows the pass/fail result of GET /identity/audit-log/verify
 * (AuditExportController.verify) — a full-table hash-chain recomputation,
 * confirming no row's stored current_hash was tampered with or corrupted. */
export function AuditVerifyResultDialog({
  result,
  open,
  onOpenChange,
}: {
  result: AuditVerifyResponseDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!result) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Chain verification {result.verified ? <Badge variant="success">Passed</Badge> : <Badge variant="destructive">Failed</Badge>}
          </DialogTitle>
          <DialogDescription>
            {result.rowsChecked} row{result.rowsChecked === 1 ? '' : 's'} checked
            {result.rangeStart ? ` from ${new Date(result.rangeStart).toLocaleString()}` : ''} through {new Date(result.rangeEnd).toLocaleString()}.
          </DialogDescription>
        </DialogHeader>
        {result.mismatchCount > 0 ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-destructive">{result.mismatchCount} hash mismatch{result.mismatchCount === 1 ? '' : 'es'} found</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 font-mono text-xs text-muted-foreground">
              {result.mismatches.map((m) => (
                <li key={m.id}>
                  #{m.id} — {m.entityType} {m.entityId}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Every row&apos;s stored hash matches an independent recomputation.</p>
        )}
        {result.checkpoints.length > 0 ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Checkpoints</p>
            {result.checkpoints.map((c) => (
              <p key={c.id} className="text-xs text-muted-foreground">
                {new Date(c.checkpointAt).toLocaleString()} — {c.anchorHashValid ? 'valid' : 'INVALID'}
              </p>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

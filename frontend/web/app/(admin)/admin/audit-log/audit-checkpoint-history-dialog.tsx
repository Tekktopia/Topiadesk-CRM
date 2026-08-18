'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Skeleton } from '@topiadesk/ui';
import type { AuditCheckpointDto } from '../_lib/types';

/**
 * Lists recent AuditCheckpoint rows — written every ~5 min by
 * backend/worker's audit-checkpoint/create-checkpoint.job.ts (one per
 * active tenant), each anchoring all 8 hash-chain lanes' head hashes into
 * one row (`anchor_hash = sha256(lane_hashes::text)`, computed by Postgres,
 * see packages/db/prisma/triggers/003_audit_checkpoint.sql). Purely a
 * history view — the actual anchor-hash self-consistency check happens
 * server-side inside GET /identity/audit-log/verify, not here.
 */
export function AuditCheckpointHistoryDialog({
  checkpoints,
  isLoading,
  open,
  onOpenChange,
}: {
  checkpoints: AuditCheckpointDto[];
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Checkpoint history</DialogTitle>
          <DialogDescription>
            Each row anchors every hash-chain lane&apos;s current head into one tamper-evident checkpoint, roughly every 5 minutes per
            tenant. &quot;Verify since checkpoint&quot; recomputes hashes only since the most recent one here.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : checkpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No checkpoints yet — the first one is created within 5 minutes of the worker starting up.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {checkpoints.map((cp) => (
              <li key={cp.id} className="rounded-md border border-border p-2.5">
                <p className="text-sm font-medium text-foreground">{new Date(cp.checkpointAt).toLocaleString()}</p>
                <p className="truncate font-mono text-xs text-muted-foreground" title={cp.anchorHash}>
                  {cp.anchorHash}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

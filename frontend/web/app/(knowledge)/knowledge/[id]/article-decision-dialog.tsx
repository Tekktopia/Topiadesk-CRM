'use client';

import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@topiadesk/ui';
import { useDecideArticleApproval } from '../../_lib/queries';
import type { ApprovalDecision } from '../../_lib/types';

/**
 * The publish/reject decision for a PENDING KNOWLEDGE_ARTICLE_PUBLISH
 * Approval — mirrors app/(policy)/policies/[id]/version-history.tsx's
 * DecideDialog exactly (same maker-checker shape, same backend contract:
 * POST .../decision with { decision, reason? }). The backend is the actual
 * enforcement point for segregation of duties (403 if the decider is also
 * the requester, or lacks approval:write) — this dialog is reachable
 * regardless of who's looking, same as that precedent.
 */
export function ArticleDecisionDialog({ articleId, open, onOpenChange }: { articleId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [decision, setDecision] = useState<ApprovalDecision>('APPROVED');
  const [reason, setReason] = useState('');
  const decideMutation = useDecideArticleApproval(articleId);

  function submit() {
    decideMutation.mutate(
      { decision, reason: reason || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setReason('');
          setDecision('APPROVED');
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decide: publish this article?</DialogTitle>
          <DialogDescription>
            Approving publishes the article immediately; rejecting sends it back to draft so the author can revise and resubmit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="article-decision">Decision</Label>
            <Select value={decision} onValueChange={(v) => setDecision(v as ApprovalDecision)}>
              <SelectTrigger id="article-decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">Approve &amp; publish</SelectItem>
                <SelectItem value="REJECTED">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="article-decision-reason">Reason (optional)</Label>
            <textarea
              id="article-decision-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant={decision === 'REJECTED' ? 'destructive' : 'default'} onClick={submit} disabled={decideMutation.isPending}>
            {decideMutation.isPending ? 'Submitting…' : decision === 'APPROVED' ? 'Approve & publish' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

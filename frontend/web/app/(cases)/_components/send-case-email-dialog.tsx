'use client';

import * as React from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea, toast } from '@topiadesk/ui';
import { useContactsByIds } from '@/app/(crm)/_lib/hooks';
import { useAddComment } from '../_lib/hooks';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Comma/semicolon-separated free text -> a de-duplicated, trimmed list of addresses. Invalid entries are reported back to the caller rather than silently dropped, so the user can fix a typo instead of quietly losing a recipient. */
function parseEmailList(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of new Set(parts)) {
    (EMAIL_RE.test(p) ? valid : invalid).push(p);
  }
  return { valid, invalid };
}

/**
 * A clearly-labeled "Send Email" action for Cases (tickets) — distinct from
 * ActivityTimeline's generic "Log Activity" dialog (packages/ui), which
 * requires knowing to pick Type=EMAIL/Direction=OUTBOUND to trigger the
 * same underlying send. This is Cases-only (the case-outbound-email
 * pipeline it relies on is Case-specific, see comments.service.ts) — kept
 * out of the shared ActivityTimeline composite deliberately, since Claims
 * and every other ActivityTimeline consumer has no such pipeline.
 *
 * Reuses useAddComment (POST /cases/:id/comments, direction: OUTBOUND,
 * type: EMAIL) rather than a new endpoint — emailTo/emailCc are purely
 * additive fields on that same existing request.
 */
export function SendCaseEmailDialog({
  open,
  onOpenChange,
  caseId,
  caseNumber,
  caseSubject,
  defaultContactId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseNumber: string;
  caseSubject: string;
  defaultContactId: string | null;
}) {
  const { contactsById } = useContactsByIds(defaultContactId ? [defaultContactId] : []);
  const addComment = useAddComment('cases', caseId);

  const [to, setTo] = React.useState('');
  const [cc, setCc] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [prefilled, setPrefilled] = React.useState(false);

  const defaultEmail = defaultContactId ? (contactsById.get(defaultContactId)?.email ?? null) : null;

  // Best-effort pre-fill once the default contact resolves (or fails to —
  // an agent may not hold read access to every case's associated contact,
  // in which case this just stays blank and they type the address).
  React.useEffect(() => {
    if (open && !prefilled) {
      setTo(defaultEmail ?? '');
      setSubject(`Re: ${caseSubject} [${caseNumber}]`);
      setBody('');
      setCc('');
      setPrefilled(true);
    }
    if (!open) setPrefilled(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEmail]);

  function handleSend() {
    const { valid: toValid, invalid: toInvalid } = parseEmailList(to);
    const { valid: ccValid, invalid: ccInvalid } = parseEmailList(cc);
    if (toInvalid.length > 0 || ccInvalid.length > 0) {
      toast.error(`Not a valid email address: ${[...toInvalid, ...ccInvalid].join(', ')}`);
      return;
    }
    if (toValid.length === 0) {
      toast.error('Add at least one recipient');
      return;
    }
    if (!body.trim()) {
      toast.error('Write a message before sending');
      return;
    }
    addComment.mutate(
      { subject, body, type: 'EMAIL', direction: 'OUTBOUND', emailTo: toValid, emailCc: ccValid.length > 0 ? ccValid : undefined },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" aria-hidden /> Send Email
          </DialogTitle>
          <DialogDescription>Sends to the addresses below and logs the message on this case&apos;s timeline.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="send-email-to">To</Label>
            <Input id="send-email-to" placeholder="client@example.com, another@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-email-cc">Cc (optional)</Label>
            <Input id="send-email-cc" placeholder="colleague@example.com" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-email-subject">Subject</Label>
            <Input id="send-email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-email-body">Message</Label>
            <Textarea id="send-email-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={addComment.isPending} className="gap-1.5">
            {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

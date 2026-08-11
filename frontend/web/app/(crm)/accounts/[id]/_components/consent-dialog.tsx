'use client';

import * as React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@topiadesk/ui';
import { formatDateTime } from '../../../_lib/format';
import { useConsentHistory, useCreateConsentRecord, useCurrentConsent } from '../../../_lib/hooks';
import type { Contact } from '../../../_lib/types';

// Suggested starting points only, not an enforced catalog — consentType is
// free text server-side (see ConsentRecord's schema comment). Prefilling a
// picker beats a blank text field for the common cases without pretending
// this is a closed set.
const SUGGESTED_CONSENT_TYPES = ['Marketing Email', 'Marketing SMS', 'Data Processing', 'Third-Party Data Sharing', 'Photo/Video Usage'];
const SUGGESTED_SOURCES = ['Web form', 'Verbal', 'Portal', 'Email reply', 'Paper form', 'Import'];
const CUSTOM = '__custom';

export function ConsentDialog({ contact, open, onOpenChange }: { contact: Contact; open: boolean; onOpenChange: (open: boolean) => void }) {
  const currentQuery = useCurrentConsent(contact.id);
  const historyQuery = useConsentHistory(contact.id);
  const createMutation = useCreateConsentRecord();

  const [consentType, setConsentType] = React.useState<string>(SUGGESTED_CONSENT_TYPES[0]!);
  const [customConsentType, setCustomConsentType] = React.useState('');
  const [granted, setGranted] = React.useState<'true' | 'false'>('true');
  const [source, setSource] = React.useState<string>(SUGGESTED_SOURCES[0]!);
  const [customSource, setCustomSource] = React.useState('');
  const [notes, setNotes] = React.useState('');

  const resolvedConsentType = consentType === CUSTOM ? customConsentType.trim() : consentType;
  const resolvedSource = source === CUSTOM ? customSource.trim() : source;
  const canSubmit = resolvedConsentType.length > 0 && resolvedSource.length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    createMutation.mutate(
      { contactId: contact.id, consentType: resolvedConsentType, granted: granted === 'true', source: resolvedSource, notes: notes.trim() || undefined },
      { onSuccess: () => setNotes('') },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Consent — {contact.firstName} {contact.lastName}</DialogTitle>
          <DialogDescription>
            An append-only log, not a single toggle — every grant/withdrawal is its own record, so there&apos;s always a provable answer to
            &quot;when did they consent to this?&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Current status</p>
            {currentQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !currentQuery.data || currentQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No consent recorded yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {currentQuery.data.map((c) => (
                  <li key={c.consentType} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      {c.granted ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />
                      )}
                      {c.consentType}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.granted ? 'Granted' : 'Withdrawn'} via {c.source} · {formatDateTime(c.recordedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Consent type</Label>
              <Select value={consentType} onValueChange={setConsentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUGGESTED_CONSENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Custom…</SelectItem>
                </SelectContent>
              </Select>
              {consentType === CUSTOM ? (
                <Input value={customConsentType} onChange={(e) => setCustomConsentType(e.target.value)} placeholder="e.g. Newsletter" />
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={granted} onValueChange={(v) => setGranted(v as 'true' | 'false')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Granted</SelectItem>
                  <SelectItem value="false">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUGGESTED_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Custom…</SelectItem>
                </SelectContent>
              </Select>
              {source === CUSTOM ? <Input value={customSource} onChange={(e) => setCustomSource(e.target.value)} placeholder="e.g. Phone call" /> : null}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context for this record" />
            </div>
            <Button className="sm:col-span-2" disabled={!canSubmit || createMutation.isPending} onClick={handleSubmit}>
              Log record
            </Button>
          </div>

          {historyQuery.data && historyQuery.data.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Full history</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {historyQuery.data.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <Badge variant={r.granted ? 'success' : 'destructive'} className="shrink-0">
                      {r.granted ? 'Granted' : 'Withdrawn'}
                    </Badge>
                    <span>
                      {r.consentType} · {r.source} · {formatDateTime(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

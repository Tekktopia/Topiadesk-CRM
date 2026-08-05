'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@topiadesk/ui';
import { ApiRequestError } from '../../_lib/api';
import { useMergeAccounts, useMergeContacts, useMergeLeads } from '../../_lib/hooks';
import type { DuplicateMatch } from '../../_lib/types';

export type MergeEntityType = 'ACCOUNT' | 'CONTACT' | 'LEAD';

/** What the merge reassigns to the survivor, per merge.ts — shown as the preview before submitting. */
const REASSIGN_PREVIEW: Record<MergeEntityType, string[]> = {
  ACCOUNT: [
    'Contacts, opportunities, activities, tasks, and policies move to the survivor',
    'Child accounts and lead-conversion links are repointed',
    'Account relationships are repointed (self/duplicate relationships dropped)',
    'Blocked if any Ticket still references the record being merged away',
  ],
  CONTACT: [
    'Activities move to the survivor',
    'Blocked if any campaign recipient record still references the contact being merged away',
  ],
  LEAD: ['Activities and tasks move to the survivor'],
};

export function MergeDialog({
  open,
  onOpenChange,
  entityType,
  pair,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: MergeEntityType;
  /** The two candidate records — the user picks which one survives. */
  pair: [DuplicateMatch, DuplicateMatch] | null;
  onMerged: () => void;
}) {
  const [winnerId, setWinnerId] = React.useState<string | null>(null);
  const mergeAccounts = useMergeAccounts();
  const mergeContacts = useMergeContacts();
  const mergeLeads = useMergeLeads();

  const mutation = entityType === 'ACCOUNT' ? mergeAccounts : entityType === 'CONTACT' ? mergeContacts : mergeLeads;

  React.useEffect(() => {
    if (open && pair) {
      setWinnerId(pair[0].id);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pair]);

  if (!pair) return null;
  const loser = pair.find((m) => m.id !== winnerId);

  // The backend's BadRequestException message (e.g. "Cannot merge: N case(s)
  // still reference the loser account...") is surfaced inline here, per the
  // build brief — not swallowed into a generic toast.
  const errorMessage =
    mutation.error instanceof ApiRequestError
      ? mutation.error.message
      : mutation.error
        ? 'Merge failed — please try again.'
        : null;

  async function handleMerge() {
    if (!winnerId || !loser) return;
    try {
      await mutation.mutateAsync({ winnerId, loserId: loser.id });
      onOpenChange(false);
      onMerged();
    } catch {
      // shown inline via mutation.error above — deliberately not a toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Merge records</DialogTitle>
          <DialogDescription>
            Pick which record survives. The other record&apos;s related data is reassigned to it, then the duplicate is
            permanently deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Survivor</p>
            {pair.map((match) => (
              <label
                key={match.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary"
              >
                <input
                  type="radio"
                  name="merge-winner"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={winnerId === match.id}
                  onChange={() => setWinnerId(match.id)}
                />
                <span>
                  <span className="block font-medium text-foreground">{match.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    Matched on {match.matchedOn.join(', ')} · {match.id.slice(0, 8)}…
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5 rounded-md bg-muted/40 p-3">
            <p className="text-xs font-medium text-foreground">What happens</p>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {REASSIGN_PREVIEW[entityType].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {errorMessage ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleMerge} disabled={mutation.isPending || !winnerId}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Merge — delete &quot;{loser?.displayName}&quot;
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

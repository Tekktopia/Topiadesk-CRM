'use client';

import * as React from 'react';
import { GitMerge, Link2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { useCases, useLinkChildCase, useMergeCase } from '../../../_lib/hooks';

/**
 * Link-child / merge actions for the case detail page. Merge is
 * non-destructive (see cases.controller.ts's doc comment on
 * CasesController.merge — the case at :id becomes a MERGED child of the
 * target, it isn't deleted), so this reads as "merge into" from the current
 * case's point of view.
 */
export function LinkMergeActions({ caseId }: { caseId: string }) {
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [otherCaseId, setOtherCaseId] = React.useState('');
  const { data: allCases } = useCases({});
  const candidates = (allCases ?? []).filter((c) => c.id !== caseId);

  const linkChild = useLinkChildCase(caseId);
  const merge = useMergeCase(caseId);

  return (
    <>
      <Button variant="outline" onClick={() => setLinkOpen(true)}>
        <Link2 aria-hidden /> Link child
      </Button>
      <Button variant="outline" onClick={() => setMergeOpen(true)}>
        <GitMerge aria-hidden /> Merge into…
      </Button>

      <Dialog
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open);
          if (!open) setOtherCaseId('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link a child ticket</DialogTitle>
            <DialogDescription>The selected ticket becomes a child of this one (PARENT_CHILD link).</DialogDescription>
          </DialogHeader>
          <CaseSelect value={otherCaseId} onValueChange={setOtherCaseId} candidates={candidates} placeholder="Select a ticket to link…" />
          <DialogFooter>
            <Button
              type="button"
              disabled={!otherCaseId || linkChild.isPending}
              onClick={() => linkChild.mutate({ childCaseId: otherCaseId }, { onSuccess: () => setLinkOpen(false) })}
            >
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mergeOpen}
        onOpenChange={(open) => {
          setMergeOpen(open);
          if (!open) setOtherCaseId('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge into another ticket</DialogTitle>
            <DialogDescription>
              This ticket becomes a MERGED, non-destructive child of the target and is closed — its own children (if any) are
              reparented to the target first.
            </DialogDescription>
          </DialogHeader>
          <CaseSelect value={otherCaseId} onValueChange={setOtherCaseId} candidates={candidates} placeholder="Select the surviving ticket…" />
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              disabled={!otherCaseId || merge.isPending}
              onClick={() => merge.mutate({ targetCaseId: otherCaseId }, { onSuccess: () => setMergeOpen(false) })}
            >
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CaseSelect({
  value,
  onValueChange,
  candidates,
  placeholder,
}: {
  value: string;
  onValueChange: (v: string) => void;
  candidates: { id: string; caseNumber: string; subject: string }[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {candidates.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.caseNumber} — {c.subject}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

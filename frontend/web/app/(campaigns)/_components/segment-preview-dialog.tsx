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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@topiadesk/ui';
import { usePreviewAudienceSegment } from '../_lib/hooks';
import type { SegmentFilterGroup, SegmentPreviewResponse } from '../_lib/types';

/**
 * POST /audience-segments/:id/preview — only reachable for an
 * already-created segment (see usePreviewAudienceSegment's comment), so this
 * is opened either from the list view's row action (saved filters) or from
 * the edit dialog (current, possibly-unsaved filters passed as `filters`).
 */
export function SegmentPreviewDialog({
  open,
  onOpenChange,
  segmentId,
  filters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segmentId: string;
  filters: SegmentFilterGroup;
}) {
  const preview = usePreviewAudienceSegment(segmentId);
  const { mutate } = preview;
  const [result, setResult] = React.useState<SegmentPreviewResponse | null>(null);

  React.useEffect(() => {
    if (!open) {
      setResult(null);
      return;
    }
    mutate(filters, { onSuccess: setResult });
    // Runs once per dialog open — re-running on every `filters` keystroke
    // would preview-as-you-type, which is more requests than this needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audience preview</DialogTitle>
          <DialogDescription>
            Contacts matching these criteria right now. A dynamic segment re-evaluates at send time, so this count can
            change before the campaign actually sends.
          </DialogDescription>
        </DialogHeader>

        {preview.isPending ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : result ? (
          <div className="space-y-3">
            <p className="text-2xl font-semibold text-foreground">
              {result.count.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">matching contacts</span>
            </p>
            {result.sample.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.sample.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-foreground">
                        {c.firstName} {c.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.email ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{c.phone ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No contacts match yet.</p>
            )}
            {result.count > result.sample.length ? (
              <p className="text-xs text-muted-foreground">Showing the {result.sample.length} most recently created matches.</p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

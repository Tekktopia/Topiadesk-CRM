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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { formatDateTime } from '../../../_lib/format';
import { usePreviewAudienceSegment, useScheduleCampaign, useSendCampaignNow } from '../../../_lib/hooks';
import type { Campaign } from '../../../_lib/types';

/**
 * Two-step Send/Schedule confirmation for an existing (DRAFT or already
 * SCHEDULED) campaign — step 1 picks timing, step 2 shows an estimated
 * recipient count (via the audience segment's preview endpoint — the actual
 * CampaignRecipient rows may not be materialized yet, see dispatch.job.ts's
 * header comment on when that happens) and an explicit "this sends real
 * messages, cannot be undone" warning before calling send/schedule. Mirrors
 * campaigns/_components/campaign-form-dialog.tsx's confirm step for
 * consistency between the two entry points (new-campaign flow vs acting on
 * an existing one).
 */
export function SendScheduleDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
}) {
  const [timing, setTiming] = React.useState<'NOW' | 'LATER'>('NOW');
  const [scheduledSendAt, setScheduledSendAt] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);

  const preview = usePreviewAudienceSegment(campaign.segmentId ?? 'unknown');
  const { mutate: runPreview } = preview;
  const sendNow = useSendCampaignNow(campaign.id);
  const schedule = useScheduleCampaign(campaign.id);
  const isPending = sendNow.isPending || schedule.isPending;

  React.useEffect(() => {
    if (open && campaign.segmentId) runPreview(undefined);
    if (!open) {
      setConfirmed(false);
      setTiming('NOW');
      setScheduledSendAt('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleConfirm() {
    if (timing === 'NOW') {
      await sendNow.mutateAsync(undefined);
    } else {
      await schedule.mutateAsync({ scheduledSendAt: new Date(scheduledSendAt).toISOString() });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {!confirmed ? (
          <>
            <DialogHeader>
              <DialogTitle>Send or schedule &quot;{campaign.name}&quot;</DialogTitle>
              <DialogDescription>This will go to everyone currently matching its audience segment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">When</label>
                <Select value={timing} onValueChange={(v) => setTiming(v as 'NOW' | 'LATER')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NOW">Send now</SelectItem>
                    <SelectItem value="LATER">Schedule for later</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {timing === 'LATER' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Send at</label>
                  <Input type="datetime-local" value={scheduledSendAt} onChange={(e) => setScheduledSendAt(e.target.value)} />
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => setConfirmed(true)} disabled={timing === 'LATER' && !scheduledSendAt}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm {timing === 'NOW' ? 'send' : 'schedule'}</DialogTitle>
              <DialogDescription>Review before this goes out.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border border-border p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated recipients</span>
                <span className="font-medium text-foreground">
                  {preview.isPending ? 'Estimating…' : preview.data ? `~${preview.data.count.toLocaleString()} contacts` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Timing</span>
                <span className="font-medium text-foreground">{timing === 'NOW' ? 'Immediately' : formatDateTime(scheduledSendAt)}</span>
              </div>
            </div>
            <p className="text-sm font-medium text-destructive">
              {timing === 'NOW'
                ? 'This sends real messages to the estimated audience above right now. This cannot be undone.'
                : 'This schedules a real send to the estimated audience above. Once it fires it cannot be undone (it can still be paused or cancelled before then).'}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmed(false)} disabled={isPending}>
                Back
              </Button>
              <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {timing === 'NOW' ? 'Send now' : 'Schedule'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

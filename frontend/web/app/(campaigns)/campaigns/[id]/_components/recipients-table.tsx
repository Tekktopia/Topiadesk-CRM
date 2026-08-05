'use client';

import { Badge, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@topiadesk/ui';
import { EmptyState } from '../../../_components/empty-state';
import { recipientStatusLabel, recipientStatusVariant } from '../../../_lib/constants';
import { formatDateTime } from '../../../_lib/format';
import type { Campaign, CampaignRecipient } from '../../../_lib/types';

/**
 * Per-recipient status table — CampaignRecipient carries contactId but not
 * a resolved contact name (see CampaignRecipientResponseDto), and there's
 * no bulk contacts-by-id lookup endpoint to resolve one cheaply for
 * potentially hundreds of rows, so contactId is shown as-is (mono text),
 * same convention as account-detail-view.tsx's "Owner ID" field for a raw
 * id with no cheap resolution path.
 */
export function RecipientsTable({
  recipients,
  isLoading,
  variants,
}: {
  recipients: CampaignRecipient[] | undefined;
  isLoading: boolean;
  variants: Campaign['variants'];
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!recipients || recipients.length === 0) {
    return (
      <EmptyState
        title="No recipients yet"
        description="Recipients appear here once the campaign is scheduled and its audience is materialized."
      />
    );
  }

  const hasVariants = Boolean(variants && variants.length > 0);
  const variantLabelById = new Map((variants ?? []).map((v) => [v.id, v.label]));

  return (
    <div className="max-h-[32rem] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contact</TableHead>
            {hasVariants ? <TableHead>Variant</TableHead> : null}
            <TableHead>Status</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Delivered</TableHead>
            <TableHead>Opened</TableHead>
            <TableHead>Clicked</TableHead>
            <TableHead>Failure reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recipients.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.contactId}</TableCell>
              {hasVariants ? (
                <TableCell className="text-muted-foreground">{r.variantId ? (variantLabelById.get(r.variantId) ?? '—') : '—'}</TableCell>
              ) : null}
              <TableCell>
                <Badge variant={recipientStatusVariant(r.status)}>{recipientStatusLabel(r.status)}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(r.sentAt)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(r.deliveredAt)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(r.openedAt)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(r.clickedAt)}</TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground">{r.failureReason ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

import type { CampaignChannel, CampaignRecipientStatus, CampaignStatus } from './types';

/** Enum option lists + label/badge mappings for the Campaigns module. Same "keep in sync manually" convention as app/(crm)/_lib/constants.ts. */

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline';

const humanize = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');

export { humanize };

export const CAMPAIGN_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
export const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELLED'] as const;
export const CAMPAIGN_AB_TEST_METRICS = ['OPEN_RATE', 'CLICK_RATE'] as const;

export function channelLabel(channel: string): string {
  switch (channel) {
    case 'EMAIL':
      return 'Email';
    case 'SMS':
      return 'SMS';
    case 'WHATSAPP':
      return 'WhatsApp';
    default:
      return humanize(channel);
  }
}

export function campaignStatusLabel(status: string): string {
  return humanize(status);
}

export function campaignStatusVariant(status: CampaignStatus | string): BadgeVariant {
  switch (status) {
    case 'DRAFT':
      return 'secondary';
    case 'SCHEDULED':
      return 'outline';
    case 'SENDING':
      return 'warning';
    case 'SENT':
      return 'success';
    case 'PAUSED':
      return 'secondary';
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function recipientStatusLabel(status: string): string {
  return humanize(status);
}

export function recipientStatusVariant(status: CampaignRecipientStatus | string): BadgeVariant {
  switch (status) {
    case 'PENDING':
      return 'outline';
    case 'QUEUED':
      return 'secondary';
    case 'SENT':
      return 'default';
    case 'DELIVERED':
    case 'OPENED':
    case 'CLICKED':
      return 'success';
    case 'BOUNCED':
    case 'FAILED':
      return 'destructive';
    case 'UNSUBSCRIBED':
      return 'warning';
    default:
      return 'outline';
  }
}

export function abTestMetricLabel(metric: string): string {
  switch (metric) {
    case 'OPEN_RATE':
      return 'Open rate';
    case 'CLICK_RATE':
      return 'Click rate';
    default:
      return humanize(metric);
  }
}

/** Statuses a campaign can no longer be edited from — mirrors campaigns.controller.ts's IN_FLIGHT_OR_DONE. */
export const CAMPAIGN_LOCKED_STATUSES: readonly CampaignStatus[] = ['SENDING', 'SENT'];

export function isCampaignChannel(value: string): value is CampaignChannel {
  return (CAMPAIGN_CHANNELS as readonly string[]).includes(value);
}

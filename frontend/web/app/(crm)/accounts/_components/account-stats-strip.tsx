'use client';

import * as React from 'react';
import { Building2, HeartPulse, ShieldAlert, UserCheck } from 'lucide-react';
import { StatsStrip } from '../../_components/stats-strip';
import type { AccountStats } from '../../_lib/types';

/**
 * Accounts KPI strip. Layout comes from the shared StatsStrip.
 *
 * "At risk" uses the relationship healthScore (renewal status + open claims
 * + payment aging), NOT riskRating — riskRating is manual underwriting risk
 * and a HIGH-risk account can be a perfectly healthy relationship. The 40
 * threshold matches the shared ScoreMeter's low band, so this tile and the
 * per-row meter always agree.
 *
 * KYC expiry is surfaced because it is an operational blocker rather than a
 * vanity number: a policy version cannot be created against an account whose
 * KYC has lapsed.
 */
export function AccountStatsStrip({ stats, isLoading }: { stats: AccountStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Total accounts',
          value: stats.total.toLocaleString(),
          icon: <Building2 aria-hidden />,
          description: `${stats.prospects.toLocaleString()} still prospects`,
        },
        {
          label: 'Clients',
          value: stats.clients.toLocaleString(),
          icon: <UserCheck aria-hidden />,
          description: 'Converted, active relationships',
        },
        {
          label: 'Average health',
          value: stats.averageHealthScore,
          icon: <HeartPulse aria-hidden />,
          description:
            stats.atRisk > 0 ? `${stats.atRisk.toLocaleString()} scored below 40` : 'No accounts in the low band',
        },
        {
          label: 'KYC expired',
          value: stats.kycExpired.toLocaleString(),
          icon: <ShieldAlert aria-hidden />,
          description: stats.kycExpired > 0 ? 'Blocks new policy versions' : 'No lapsed KYC',
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}

'use client';

import * as React from 'react';
import { Coins, Layers, Sparkles, Users } from 'lucide-react';
import { StatsStrip } from './stats-strip';
import type { LoyaltyStats } from '../_lib/types';

/**
 * Loyalty-programme KPI strip.
 *
 * "Points outstanding" is framed as a liability rather than a score on
 * purpose — every unredeemed point is something the business still owes a
 * customer, and that is the number a programme manager is accountable for.
 * It is the net of earns and redemptions, matching how each row's balance is
 * derived, so the header and the table can never disagree.
 *
 * The tier tile names the largest tier rather than listing all of them: tier
 * is free text (tenants invent their own), so a fixed set of tiles would be
 * wrong for anyone who did.
 */
export function LoyaltyStatsStrip({ stats, isLoading }: { stats: LoyaltyStats | undefined; isLoading: boolean }) {
  const topTier = stats?.tierBreakdown.reduce<{ tier: string; members: number } | null>(
    (best, t) => (best === null || t.members > best.members ? t : best),
    null,
  );

  const tiles = stats
    ? [
        {
          label: 'Enrolled members',
          value: stats.members.toLocaleString(),
          icon: <Users aria-hidden />,
          description: `${stats.tierBreakdown.length.toLocaleString()} tier${stats.tierBreakdown.length === 1 ? '' : 's'} in use`,
        },
        {
          label: 'Points outstanding',
          value: stats.pointsOutstanding.toLocaleString(),
          icon: <Coins aria-hidden />,
          description: 'Earned but not yet redeemed',
        },
        {
          label: 'Largest tier',
          value: topTier ? topTier.tier : '—',
          icon: <Layers aria-hidden />,
          description: topTier ? `${topTier.members.toLocaleString()} member${topTier.members === 1 ? '' : 's'}` : 'Nobody enrolled yet',
        },
        {
          label: 'New this month',
          value: stats.enrolledLast30Days.toLocaleString(),
          icon: <Sparkles aria-hidden />,
          description: 'Enrolled in the last 30 days',
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}

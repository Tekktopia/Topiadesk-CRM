'use client';

import * as React from 'react';
import { ArrowDownLeft, ArrowUpRight, Bot, Users } from 'lucide-react';
import { StatsStrip } from './stats-strip';
import type { ActivityStats } from '../_lib/types';

/**
 * Team-activity KPI strip.
 *
 * "People logging" is the tile a branch manager reads first. The same
 * activity count spread across two people versus twelve describes two
 * completely different teams, and a raw total hides that entirely.
 *
 * Automated entries are counted apart from the rest for the same reason:
 * inbound email and WhatsApp write activities without a human author, so
 * folding them in would let integration traffic masquerade as team effort.
 */
export function ActivityStatsStrip({ stats, isLoading }: { stats: ActivityStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Interactions',
          value: stats.total.toLocaleString(),
          icon: <ArrowUpRight aria-hidden />,
          description: `${stats.outbound.toLocaleString()} out · ${stats.inbound.toLocaleString()} in`,
        },
        {
          label: 'People logging',
          value: stats.loggedByPeople.toLocaleString(),
          icon: <Users aria-hidden />,
          description: stats.loggedByPeople > 0 ? 'Distinct team members active' : 'Nobody logged anything',
        },
        {
          label: 'Clients touched',
          value: stats.accountsTouched.toLocaleString(),
          icon: <ArrowDownLeft aria-hidden />,
          description: 'Distinct accounts with activity',
        },
        {
          label: 'Automated',
          value: stats.systemLogged.toLocaleString(),
          icon: <Bot aria-hidden />,
          description: stats.systemLogged > 0 ? 'Captured by an integration, not a person' : 'All entries logged by people',
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}

'use client';

import * as React from 'react';
import { AlarmClock, CalendarClock, UserX, Wallet } from 'lucide-react';
import { StatsStrip } from '../../../(crm)/_components/stats-strip';
import type { RenewalBoardStats } from '../../lib/types';

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

/**
 * Renewal-book KPI strip.
 *
 * "Overdue" leads because it is the only bucket that represents money already
 * lost rather than money at risk — a policy past its expiry that was never
 * renewed. "Nobody working it" merges two states a manager can't act on
 * differently (no renewal schedule at all, and a schedule with no owner);
 * the split is available on the board itself for whoever needs it.
 *
 * Value at risk is gross premium in the base currency the API converted to,
 * since a brokerage writes business in several.
 */
export function RenewalStatsStrip({ stats, isLoading }: { stats: RenewalBoardStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Past expiry',
          value: stats.overdue.toLocaleString(),
          icon: <AlarmClock aria-hidden />,
          description: stats.overdue > 0 ? 'Expired and never renewed' : 'Nothing has lapsed unnoticed',
        },
        {
          label: 'Due in 30 days',
          value: stats.dueIn30.toLocaleString(),
          icon: <CalendarClock aria-hidden />,
          description: `${stats.dueIn90.toLocaleString()} within 90 days`,
        },
        {
          label: 'Nobody working it',
          value: stats.unassigned.toLocaleString(),
          icon: <UserX aria-hidden />,
          description:
            stats.noScheduleStarted > 0
              ? `${stats.noScheduleStarted.toLocaleString()} not even started`
              : 'Every renewal has an owner',
        },
        {
          label: 'Value at risk',
          value: money(stats.valueAtRisk, stats.baseCurrency),
          icon: <Wallet aria-hidden />,
          description: `Gross premium across ${stats.total.toLocaleString()} policies`,
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}

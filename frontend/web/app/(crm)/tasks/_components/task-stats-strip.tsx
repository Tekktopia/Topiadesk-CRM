'use client';

import * as React from 'react';
import { AlarmClock, CalendarClock, CheckCircle2, ListTodo } from 'lucide-react';
import { StatsStrip } from '../../_components/stats-strip';
import type { TaskStats } from '../../_lib/types';

/**
 * Tasks KPI strip. Layout comes from the shared StatsStrip.
 *
 * "Open" counts everything that is neither COMPLETED nor CANCELLED — an
 * IN_PROGRESS task is still outstanding work, so counting only status=OPEN
 * would under-report every active queue.
 *
 * Undated tasks are surfaced on the Open tile rather than folded into
 * overdue: a task with no due date is not late, it is unplanned, and those
 * are different problems with different fixes.
 */
export function TaskStatsStrip({ stats, isLoading }: { stats: TaskStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Open tasks',
          value: stats.open.toLocaleString(),
          icon: <ListTodo aria-hidden />,
          description:
            stats.noDueDate > 0 ? `${stats.noDueDate.toLocaleString()} with no due date` : 'All open tasks are dated',
        },
        {
          label: 'Overdue',
          value: stats.overdue.toLocaleString(),
          icon: <AlarmClock aria-hidden />,
          description: stats.overdue > 0 ? 'Past their due date and still open' : 'Nothing past due',
        },
        {
          label: 'Due today',
          value: stats.dueToday.toLocaleString(),
          icon: <CalendarClock aria-hidden />,
          description: 'Open and due before midnight',
        },
        {
          label: 'Completed',
          value: stats.completed.toLocaleString(),
          icon: <CheckCircle2 aria-hidden />,
          description: `${stats.total.toLocaleString()} tasks in this view`,
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}

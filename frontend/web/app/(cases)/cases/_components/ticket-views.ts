import { AlertCircle, CircleDot, Eye, Flame, Hourglass, Inbox, MailWarning, Send, Sparkles, Users, type LucideIcon } from 'lucide-react';
import type { CaseQuery } from '../../_lib/types';

const TERMINAL_STATUSES: CaseQuery['excludeStatuses'] = ['RESOLVED', 'CLOSED'];

export interface TicketView {
  id: string;
  section: 'Shared' | 'Default';
  label: string;
  icon: LucideIcon;
  /** Resolved at render time against the signed-in user's id — a fixed, always-fresh preset rather than a stored/user-editable saved view (see the plan's "Saved views" scoping decision). */
  resolve: (currentUserId: string) => CaseQuery;
}

/**
 * Fixed preset ticket views (Freshdesk-style sidebar). Every entry maps to
 * a real, verified filter — no Sentiment/Spam/Trash/AI-agent/mentions
 * views, since none of those have backing data in this app today (see the
 * approved plan's Context section).
 */
export const TICKET_VIEWS: TicketView[] = [
  {
    id: 'my-open-pending',
    section: 'Shared',
    label: 'My Open and Pending Tickets',
    icon: Inbox,
    resolve: (me) => ({ assignedToId: me, statuses: ['NEW', 'OPEN', 'PENDING_CUSTOMER', 'PENDING_CARRIER', 'REOPENED'] }),
  },
  {
    id: 'my-overdue',
    section: 'Shared',
    label: 'My Overdue Tickets',
    icon: Hourglass,
    resolve: (me) => ({ assignedToId: me, resolutionDueBy: 'OVERDUE' }),
  },
  {
    id: 'open-in-my-groups',
    section: 'Shared',
    label: 'Open Tickets in My Groups',
    icon: Users,
    resolve: () => ({ myTeams: true, excludeStatuses: TERMINAL_STATUSES }),
  },
  {
    id: 'urgent-high-priority',
    section: 'Shared',
    label: 'Urgent and High priority Tickets',
    icon: Flame,
    resolve: () => ({ priorities: ['URGENT', 'HIGH'], excludeStatuses: TERMINAL_STATUSES }),
  },
  {
    id: 'all-tickets',
    section: 'Default',
    label: 'All tickets',
    icon: CircleDot,
    resolve: () => ({}),
  },
  {
    id: 'undelivered-messages',
    section: 'Default',
    label: 'All undelivered messages',
    icon: MailWarning,
    resolve: () => ({ undeliveredOnly: true }),
  },
  {
    id: 'all-unresolved',
    section: 'Default',
    label: 'All unresolved tickets',
    icon: AlertCircle,
    resolve: () => ({ excludeStatuses: TERMINAL_STATUSES }),
  },
  {
    id: 'new-and-mine',
    section: 'Default',
    label: 'New and my open tickets',
    icon: Sparkles,
    resolve: () => ({ newOrMine: true }),
  },
  {
    id: 'raised-by-me',
    section: 'Default',
    label: 'Tickets I raised',
    icon: Send,
    resolve: (me) => ({ raisedByUserId: me }),
  },
  {
    id: 'watching',
    section: 'Default',
    label: "Tickets I'm watching",
    icon: Eye,
    resolve: (me) => ({ watchingUserId: me }),
  },
];

export const DEFAULT_TICKET_VIEW_ID = 'all-tickets';

export const TICKET_VIEW_SECTIONS: TicketView['section'][] = ['Shared', 'Default'];

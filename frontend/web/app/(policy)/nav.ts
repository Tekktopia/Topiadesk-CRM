import { FileClock, Receipt, FolderOpen, ShieldCheck, Users, Percent, CalendarClock } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/** Policy Lifecycle feature area: policy list/detail (lifecycle state
 * machine + maker-checker approvals), premium aging, producer/commission
 * tracking, and the document manager. See app/(policy)/policies,
 * app/(policy)/premiums, app/(policy)/producers,
 * app/(policy)/producer-commissions, app/(policy)/documents. */
export const policyNav: NavItem[] = [
  { label: 'Policies', href: '/policies', icon: FileClock, section: 'Policy' },
  { label: 'Renewals', href: '/renewals', icon: CalendarClock, section: 'Policy' },
  { label: 'Premiums', href: '/premiums', icon: Receipt, section: 'Policy' },
  { label: 'Producers', href: '/producers', icon: Users, section: 'Policy' },
  { label: 'Commissions', href: '/producer-commissions', icon: Percent, section: 'Policy' },
  { label: 'Documents', href: '/documents', icon: FolderOpen, section: 'Policy' },
  // Not adminOnly — same visibility convention as (cases)/nav.ts's SLA
  // Policies item: the nav link itself is unrestricted, write actions are
  // gated server-side (@RequirePermission('approval','write')) and
  // client-side (useCan) on the page itself.
  { label: 'Approval Rules', href: '/approval-threshold-rules', icon: ShieldCheck, section: 'Policy' },
];

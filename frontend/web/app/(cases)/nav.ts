import { AlertTriangle, BarChart3, Clock, GitBranch, LifeBuoy, ListChecks, ShieldAlert, Sparkles, Tag, Timer, Zap } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Case Management route-group nav entries — see app/(dashboard)/nav.ts for
 * the pattern this follows and app/layout.tsx for how it's aggregated into
 * the sidebar. Claims (insurance claims lifecycle) + Cases (Enquiry/Service
 * Request/Complaint) + Case Dashboard (KPIs) get their own top-level
 * entries under `section: 'Cases'`; SLA Policies/Macros/Assignment
 * Rules/Business Hours/Agent Skills/Case Categories/Loss Cause Categories/
 * Business Rules are the shared admin/config tier those two lifecycles run
 * on, grouped
 * under `section: 'Case Config'` so they read as a distinct, lower-traffic
 * cluster in the sidebar.
 */
export const casesNav: NavItem[] = [
  { label: 'Claims', href: '/claims', icon: ShieldAlert, section: 'Tickets' },
  { label: 'Tickets', href: '/cases', icon: LifeBuoy, section: 'Tickets' },
  { label: 'Ticket Dashboard', href: '/case-dashboard', icon: BarChart3, section: 'Tickets' },
  { label: 'SLA Policies', href: '/sla-policies', icon: Timer, section: 'Ticket Config' },
  { label: 'Macros', href: '/macros', icon: Zap, section: 'Ticket Config' },
  { label: 'Assignment Rules', href: '/assignment-rules', icon: GitBranch, section: 'Ticket Config' },
  { label: 'Business Hours', href: '/business-hours', icon: Clock, section: 'Ticket Config' },
  { label: 'Agent Skills', href: '/agent-skills', icon: Sparkles, section: 'Ticket Config' },
  { label: 'Ticket Categories', href: '/case-categories', icon: Tag, section: 'Ticket Config' },
  { label: 'Loss Cause Categories', href: '/loss-cause-categories', icon: AlertTriangle, section: 'Ticket Config' },
  { label: 'Business Rules', href: '/business-rules', icon: ListChecks, section: 'Ticket Config' },
];

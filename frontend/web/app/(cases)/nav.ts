import { AlertTriangle, Clock, GitBranch, LifeBuoy, ShieldAlert, Sparkles, Tag, Timer, Zap } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Case Management route-group nav entries — see app/(dashboard)/nav.ts for
 * the pattern this follows and app/layout.tsx for how it's aggregated into
 * the sidebar. Claims (insurance claims lifecycle) + Cases (Enquiry/Service
 * Request/Complaint) get their own top-level entries under `section:
 * 'Cases'`; SLA Policies/Macros/Assignment Rules/Business Hours/Agent
 * Skills/Case Categories/Loss Cause Categories are the shared admin/config
 * tier those two lifecycles run on, grouped under `section: 'Case Config'`
 * so they read as a distinct, lower-traffic cluster in the sidebar.
 */
export const casesNav: NavItem[] = [
  { label: 'Claims', href: '/claims', icon: ShieldAlert, section: 'Cases' },
  { label: 'Cases', href: '/cases', icon: LifeBuoy, section: 'Cases' },
  { label: 'SLA Policies', href: '/sla-policies', icon: Timer, section: 'Case Config' },
  { label: 'Macros', href: '/macros', icon: Zap, section: 'Case Config' },
  { label: 'Assignment Rules', href: '/assignment-rules', icon: GitBranch, section: 'Case Config' },
  { label: 'Business Hours', href: '/business-hours', icon: Clock, section: 'Case Config' },
  { label: 'Agent Skills', href: '/agent-skills', icon: Sparkles, section: 'Case Config' },
  { label: 'Case Categories', href: '/case-categories', icon: Tag, section: 'Case Config' },
  { label: 'Loss Cause Categories', href: '/loss-cause-categories', icon: AlertTriangle, section: 'Case Config' },
];

import { Award, Briefcase, Building2, CheckSquare, ListPlus, Radar, ShieldAlert, SlidersHorizontal, Target, TrendingUp, Users } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * CRM route-group nav entries — see app/(dashboard)/nav.ts for the pattern
 * this follows and app/layout.tsx for how it's aggregated into the sidebar.
 * `section: 'CRM'` groups these under a shared heading alongside (policy)/
 * (admin)'s own entries once the sidebar renders section headings.
 */
export const crmNav: NavItem[] = [
  { label: 'Accounts', href: '/accounts', icon: Building2, section: 'CRM' },
  { label: 'Leads', href: '/leads', icon: Target, section: 'CRM' },
  { label: 'Lead Sources', href: '/lead-sources', icon: Radar, section: 'CRM' },
  { label: 'Pipeline', href: '/opportunities', icon: Briefcase, section: 'CRM' },
  { label: 'Pipeline Setup', href: '/pipeline-setup', icon: SlidersHorizontal, section: 'CRM' },
  { label: 'Carriers', href: '/carriers', icon: Users, section: 'CRM' },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare, section: 'CRM' },
  { label: 'Custom Fields', href: '/custom-fields', icon: ListPlus, section: 'CRM' },
  { label: 'Sales Quotas', href: '/sales-quotas', icon: TrendingUp, section: 'CRM' },
  { label: 'Loyalty', href: '/loyalty', icon: Award, section: 'CRM' },
  { label: 'Data Requests', href: '/data-subject-requests', icon: ShieldAlert, section: 'CRM' },
];

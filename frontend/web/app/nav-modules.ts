import { Briefcase, BookOpen, FileClock, LayoutDashboard, LifeBuoy, Megaphone, ShieldCheck } from 'lucide-react';
import { dashboardNav } from './(dashboard)/nav';
import { crmNav } from './(crm)/nav';
import { policyNav } from './(policy)/nav';
import { adminNav } from './(admin)/nav';
import { casesNav } from './(cases)/nav';
import { knowledgeNav } from './(knowledge)/nav';
import { reportsNav } from './(reports)/nav';
import { campaignsNav } from './(campaigns)/nav';
import type { NavItem } from '@/lib/nav-types';

/**
 * Shared between app-sidebar.tsx (icon rail + panel) and app-header.tsx
 * (breadcrumb) — both are Client Components, so importing this plain
 * module (not a Server→Client prop) never hits the icon-serialization
 * issue documented in app-sidebar.tsx. One module = one route group's
 * nav.ts, same boundary as before this file existed; this just gives both
 * consumers one place to compute "which module is the current page in."
 */
export interface NavModule {
  key: string;
  label: string;
  icon: NavItem['icon'];
  indexHref: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export const NAV_MODULES: NavModule[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, indexHref: '/', items: dashboardNav },
  { key: 'crm', label: 'CRM', icon: Briefcase, indexHref: '/accounts', items: crmNav },
  { key: 'policy', label: 'Policy', icon: FileClock, indexHref: '/policies', items: policyNav },
  { key: 'cases', label: 'Tickets', icon: LifeBuoy, indexHref: '/cases', items: casesNav },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen, indexHref: '/knowledge', items: knowledgeNav },
  { key: 'reports', label: 'Reports', icon: LayoutDashboard, indexHref: '/reports', items: reportsNav },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone, indexHref: '/campaigns', items: campaignsNav },
  { key: 'admin', label: 'Admin', icon: ShieldCheck, indexHref: '/admin/users', items: adminNav, adminOnly: true },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Falls back to the 'dashboard' module (never adminOnly, always present) when nothing matches — e.g. /profile, which has no nav entry of its own. */
export function activeNavModule(pathname: string, modules: NavModule[] = NAV_MODULES): NavModule {
  for (const mod of modules) {
    if (mod.items.some((item) => isNavItemActive(pathname, item.href))) return mod;
  }
  return modules.find((m) => m.key === 'dashboard') ?? modules[0]!;
}

/** The specific nav item matching the current path within its module, if any — e.g. "Accounts" within the CRM module. Used for the header breadcrumb's trailing segment. */
export function activeNavItem(pathname: string, mod: NavModule): NavItem | undefined {
  return mod.items.find((item) => isNavItemActive(pathname, item.href));
}

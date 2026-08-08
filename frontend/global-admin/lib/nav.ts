import type { LucideIcon } from 'lucide-react';
import { Activity, Building2, LayoutDashboard, LifeBuoy, Package, ScrollText, ShieldCheck, Users } from 'lucide-react';

/**
 * Global Admin's own nav list — deliberately flat (no NavModule/section
 * grouping like frontend/web's app-sidebar.tsx): every item here is a
 * single destination, not a module with its own sub-pages, so a two-tier
 * icon-rail+panel shell would just be an empty panel most of the time. See
 * this session's plan for the full reasoning.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Tenants', href: '/tenants', icon: Building2 },
  { label: 'Tenant Admins', href: '/tenant-admins', icon: Users },
  { label: 'Platform Admins', href: '/admins', icon: ShieldCheck },
  { label: 'Subscriptions & Licensing', href: '/plans', icon: Package },
  { label: 'Usage & Monitoring', href: '/usage', icon: Activity },
  { label: 'Support Tickets', href: '/support-tickets', icon: LifeBuoy },
  { label: 'Audit Log', href: '/audit-log', icon: ScrollText },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

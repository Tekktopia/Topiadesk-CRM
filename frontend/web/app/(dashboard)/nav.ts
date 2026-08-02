import { LayoutDashboard } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Per-route-group nav export — the pattern every later route group
 * ((crm), (policy), (admin)) copies: one `nav.ts` file next to the
 * group's `page.tsx`/`layout.tsx`, exporting a `NavItem[]`. The root
 * layout (`app/layout.tsx`) imports every group's array and concatenates
 * them into the sidebar. Deliberately minimal (a single "Dashboard" entry
 * at "/") — the real operational dashboard (KPIs, pipeline funnel, renewal
 * timeline; see ./page.tsx and ./dashboard-view.tsx) is the destination,
 * this file just points the sidebar at it.
 */
export const dashboardNav: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
];

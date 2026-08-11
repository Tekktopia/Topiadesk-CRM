import { CheckCircle2, LayoutDashboard, MessageCircle } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Per-route-group nav export — the pattern every later route group
 * ((crm), (policy), (admin)) copies: one `nav.ts` file next to the
 * group's `page.tsx`/`layout.tsx`, exporting a `NavItem[]`. The root
 * layout (`app/layout.tsx`) imports every group's array and concatenates
 * them into the sidebar. Deliberately minimal (a single "Dashboard" entry
 * at "/dashboard") — the real operational dashboard (KPIs, pipeline funnel,
 * renewal timeline; see ./dashboard/page.tsx and ./dashboard-view.tsx) is
 * the destination, this file just points the sidebar at it. "/" itself is
 * the app's public entry chooser now (see app/page.tsx), not the
 * dashboard — an authenticated visit to "/" redirects straight here via
 * middleware.ts, but nothing inside the authenticated app should link to
 * "/" directly anymore.
 */
export const dashboardNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Approvals', href: '/approvals', icon: CheckCircle2 },
  { label: 'Live Chat Widget (demo)', href: '/widget-demo', icon: MessageCircle },
];

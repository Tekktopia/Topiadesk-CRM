import { LayoutDashboard } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Per-route-group nav export — the pattern every later route group
 * ((crm), (policy), (admin)) should copy: one `nav.ts` file next to the
 * group's `page.tsx`/`layout.tsx`, exporting a `NavItem[]`. The root
 * layout (`app/layout.tsx`) imports every group's array and concatenates
 * them into the sidebar — this file is intentionally minimal (a single
 * "Dashboard" entry) since the (dashboard) group itself is just the
 * Phase-0 placeholder home page, not a real feature area.
 */
export const dashboardNav: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
];

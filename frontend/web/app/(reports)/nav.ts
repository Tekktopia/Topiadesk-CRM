import { BarChart3, CalendarClock, SlidersHorizontal } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Reporting/BI route-group nav entries — see app/(dashboard)/nav.ts for the
 * pattern this follows. The fixed-registry report catalog + scheduled
 * report delivery, plus Custom Reports: an allow-list-validated ad-hoc
 * builder (never raw SQL — see custom-report-field-registry.ts on the
 * backend) additive to the fixed registry, not a replacement for it.
 */
export const reportsNav: NavItem[] = [
  { label: 'Reports', href: '/reports', icon: BarChart3, section: 'Reports' },
  { label: 'Custom Reports', href: '/reports/custom', icon: SlidersHorizontal, section: 'Reports' },
  { label: 'Scheduled Reports', href: '/reports/scheduled', icon: CalendarClock, section: 'Reports' },
];

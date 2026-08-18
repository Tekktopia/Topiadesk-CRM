import { LayoutDashboard, UserCheck } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Only this section's own two pages — Dashboard (new) and KYC Tracking
 * (new, the one genuinely new capability this section adds: no prior
 * org-wide view of "which accounts need KYC attention" existed). Data
 * Subject Requests / Audit Log / Field Permissions already exist elsewhere
 * (CRM/Admin) and stay there; the Dashboard page links out to them as
 * quick-link cards instead of duplicating their hrefs into this nav array
 * — activeNavModule() (nav-modules.ts) picks the FIRST module whose items
 * contain a matching href, so listing someone else's href here would make
 * this module's sidebar section highlight instead of theirs whenever a
 * user is actually on that other page, which reads as a bug, not a
 * consolidation. Gated the same way (admin) is — see NAV_MODULES's own
 * `adminOnly` flag in nav-modules.ts, which despite the name already means
 * "ADMIN or COMPLIANCE_OFFICER" (see app-sidebar.tsx's canSeeAdminOnly()).
 */
export const complianceNav: NavItem[] = [
  { label: 'Dashboard', href: '/compliance', icon: LayoutDashboard, adminOnly: true },
  { label: 'KYC Tracking', href: '/compliance/kyc', icon: UserCheck, adminOnly: true },
];

import {
  Bell,
  Building2,
  MapPin,
  Network,
  ScrollText,
  Settings,
  ShieldCheck,
  UsersRound,
  Wifi,
} from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Admin route group — Identity (users/roles/permissions/departments/
 * branches/teams/org-settings/ip-whitelist), Integrations monitoring,
 * Notifications inbox, and the Audit Log viewer. See
 * backend/api/src/modules/identity/*.controller.ts for the domain this
 * mirrors. All pages live under /admin/* (see app/(admin)/admin/*).
 */
export const adminNav: NavItem[] = [
  { label: 'Users', href: '/admin/users', icon: UsersRound, section: 'Admin' },
  { label: 'Roles & Permissions', href: '/admin/roles', icon: ShieldCheck, section: 'Admin' },
  { label: 'Departments', href: '/admin/departments', icon: Building2, section: 'Admin' },
  { label: 'Branches', href: '/admin/branches', icon: MapPin, section: 'Admin' },
  { label: 'Teams', href: '/admin/teams', icon: UsersRound, section: 'Admin' },
  { label: 'Org Settings', href: '/admin/settings', icon: Settings, section: 'Admin' },
  { label: 'IP Whitelist', href: '/admin/ip-whitelist', icon: Wifi, section: 'Admin' },
  { label: 'Integrations', href: '/admin/integrations', icon: Network, section: 'Admin' },
  { label: 'Notifications', href: '/admin/notifications', icon: Bell, section: 'Admin' },
  { label: 'Audit Log', href: '/admin/audit-log', icon: ScrollText, section: 'Admin' },
];

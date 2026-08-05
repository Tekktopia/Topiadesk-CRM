import {
  Bell,
  Building2,
  Clock,
  GitBranch,
  KeyRound,
  MapPin,
  Network,
  ScrollText,
  Settings,
  ShieldCheck,
  UsersRound,
  Webhook,
  Wifi,
  Zap,
} from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Admin route group — split into four sections following the same
 * noun-type principle Zendesk's Admin Center uses (People / Security /
 * Workflow / System, rather than one flat bucket): "People & Access" is the
 * actor domain (who exists, what they can do), "Security" is protective
 * controls and their audit trail, "Workflow" is rule-based automation
 * ("Triggers" vs "Automations", split the same way Zendesk splits them —
 * see AutomationRule.triggerType in packages/db/prisma/schema.prisma),
 * "System" is tenant-wide configuration and outbound plumbing. All pages
 * live under /admin/* and are hidden from the sidebar entirely for
 * non-admins via `adminOnly` (see app/(admin)/admin/_lib/permissions.ts for
 * the matching backend-aligned check used on the pages themselves).
 */
export const adminNav: NavItem[] = [
  { label: 'Users', href: '/admin/users', icon: UsersRound, section: 'People & Access', adminOnly: true },
  { label: 'Roles & Permissions', href: '/admin/roles', icon: ShieldCheck, section: 'People & Access', adminOnly: true },
  { label: 'Departments', href: '/admin/departments', icon: Building2, section: 'People & Access', adminOnly: true },
  { label: 'Branches', href: '/admin/branches', icon: MapPin, section: 'People & Access', adminOnly: true },
  { label: 'Teams', href: '/admin/teams', icon: UsersRound, section: 'People & Access', adminOnly: true },

  { label: 'IP Whitelist', href: '/admin/ip-whitelist', icon: Wifi, section: 'Security', adminOnly: true },
  { label: 'SCIM Tokens', href: '/admin/scim-tokens', icon: KeyRound, section: 'Security', adminOnly: true },
  { label: 'Audit Log', href: '/admin/audit-log', icon: ScrollText, section: 'Security', adminOnly: true },

  { label: 'Workflows', href: '/admin/workflows', icon: GitBranch, section: 'Workflow', adminOnly: true },
  { label: 'Triggers', href: '/admin/triggers', icon: Zap, section: 'Workflow', adminOnly: true },
  { label: 'Automations', href: '/admin/automations', icon: Clock, section: 'Workflow', adminOnly: true },

  { label: 'Org Settings', href: '/admin/settings', icon: Settings, section: 'System', adminOnly: true },
  { label: 'Integrations', href: '/admin/integrations', icon: Network, section: 'System', adminOnly: true },
  { label: 'Webhooks', href: '/admin/webhooks', icon: Webhook, section: 'System', adminOnly: true },
  { label: 'Notifications', href: '/admin/notifications', icon: Bell, section: 'System', adminOnly: true },
];

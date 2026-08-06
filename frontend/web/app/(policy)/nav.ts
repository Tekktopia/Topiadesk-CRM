import { FileClock, Receipt, FolderOpen, ShieldCheck } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/** Policy Lifecycle feature area: policy list/detail (lifecycle state
 * machine + maker-checker approvals), premium aging, and the document
 * manager. See app/(policy)/policies, app/(policy)/premiums,
 * app/(policy)/documents. */
export const policyNav: NavItem[] = [
  { label: 'Policies', href: '/policies', icon: FileClock, section: 'Policy' },
  { label: 'Premiums', href: '/premiums', icon: Receipt, section: 'Policy' },
  { label: 'Documents', href: '/documents', icon: FolderOpen, section: 'Policy' },
  // Not adminOnly — same visibility convention as (cases)/nav.ts's SLA
  // Policies item: the nav link itself is unrestricted, write actions are
  // gated server-side (@RequirePermission('approval','write')) and
  // client-side (useCan) on the page itself.
  { label: 'Approval Rules', href: '/approval-threshold-rules', icon: ShieldCheck, section: 'Policy' },
];

import { FileText, Megaphone, ShieldOff, UsersRound } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Campaign management route-group nav entries — see app/(dashboard)/nav.ts
 * for the pattern this follows. Email/SMS/WhatsApp campaigns, templates,
 * and audience segments. Filled in by the Phase 2 Campaigns frontend batch.
 */
export const campaignsNav: NavItem[] = [
  { label: 'Campaigns', href: '/campaigns', icon: Megaphone, section: 'Campaigns' },
  { label: 'Templates', href: '/campaigns/templates', icon: FileText, section: 'Campaigns' },
  { label: 'Audience Segments', href: '/audience-segments', icon: UsersRound, section: 'Campaigns' },
  { label: 'Suppressions', href: '/campaigns/suppressions', icon: ShieldOff, section: 'Campaigns' },
];

import { BookOpen, ClipboardList } from 'lucide-react';
import type { NavItem } from '@/lib/nav-types';

/**
 * Knowledge Base route-group nav entries — see app/(dashboard)/nav.ts for
 * the pattern this follows and app/layout.tsx for how it's aggregated into
 * the sidebar. Internal staff-facing KB (articles/categories), with publish
 * gated by the existing Approval maker-checker flow. Category management
 * lives under /knowledge/categories (no separate nav entry — reached from
 * the Knowledge Base list page, same as how account detail sub-resources
 * aren't top-level nav items either). The public /survey-respond/[token]
 * page has no nav entry — it's reached only via an emailed/SMS'd link, never
 * app navigation.
 */
export const knowledgeNav: NavItem[] = [
  { label: 'Knowledge Base', href: '/knowledge', icon: BookOpen, section: 'Knowledge' },
  { label: 'Surveys', href: '/knowledge/surveys', icon: ClipboardList, section: 'Knowledge' },
];

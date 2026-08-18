import { formatNaira } from '@/app/(policy)/lib/format';
import type { OperationalKpis } from './dashboard-hooks';

export type KpiTileAccent = 'violet' | 'navy' | 'blue' | 'teal';

/** String key, not a component reference — resolved to JSX by kpi-strip.tsx's ICONS map, same Server->Client serialization reasoning as GradientStatTile's own icon prop doc comment. */
export type KpiTileIconName = 'Briefcase' | 'TrendingUp' | 'CalendarClock' | 'Users' | 'Trophy' | 'Percent' | 'Building2' | 'UserPlus' | 'Target' | 'ShieldCheck' | 'Wallet' | 'TrendingDown';

export interface KpiTileSpec {
  key: string;
  label: string;
  icon: KpiTileIconName;
  accent: KpiTileAccent;
  href?: string;
  value: (kpis: OperationalKpis) => string | number;
  description: (kpis: OperationalKpis) => string;
}

const percent = (ratio: number | null): string => (ratio === null ? '—' : `${Math.round(ratio * 100)}%`);

/**
 * Every tile the main dashboard's KPI strip can show, keyed by
 * OperationalKpiResponseDto field names. The default 6 (DEFAULT_KPI_TILE_KEYS
 * below) reproduce the original fixed strip exactly; the other 6 give users
 * something real to add via "Customize tiles" without inventing numbers the
 * backend doesn't already compute.
 */
export const KPI_TILE_CATALOG: KpiTileSpec[] = [
  {
    key: 'openOpportunities',
    label: 'Open opportunities',
    icon: 'Briefcase',
    accent: 'violet',
    href: '/opportunities?isOpen=true',
    value: (k) => k.openOpportunities,
    description: () => 'active pipeline stages',
  },
  {
    key: 'pipelineValue',
    label: 'Pipeline value',
    icon: 'TrendingUp',
    accent: 'navy',
    href: '/opportunities?isOpen=true',
    value: (k) => formatNaira(k.pipelineValue),
    description: () => 'sum of open opportunities',
  },
  {
    key: 'renewalsDueNext90Days',
    label: 'Renewals due (90d)',
    icon: 'CalendarClock',
    accent: 'blue',
    value: (k) => k.renewalsDueNext90Days,
    description: () => 'across all policies',
  },
  {
    key: 'activeClients',
    label: 'Active clients',
    icon: 'Users',
    accent: 'teal',
    href: '/accounts?status=CLIENT',
    value: (k) => k.activeClients,
    description: () => 'accounts on CLIENT status',
  },
  {
    key: 'wonThisMonthCount',
    label: 'Won this month',
    icon: 'Trophy',
    accent: 'violet',
    value: (k) => k.wonThisMonthCount,
    description: (k) => formatNaira(k.wonThisMonthValue),
  },
  {
    key: 'winRate',
    label: 'Win rate',
    icon: 'Percent',
    accent: 'navy',
    value: (k) => percent(k.winRate),
    description: () => 'won vs. decided, all-time',
  },
  {
    key: 'totalAccounts',
    label: 'Total accounts',
    icon: 'Building2',
    accent: 'blue',
    href: '/accounts',
    value: (k) => k.totalAccounts,
    description: () => 'all accounts, any status',
  },
  {
    key: 'newLeadsThisMonth',
    label: 'New leads this month',
    icon: 'UserPlus',
    accent: 'teal',
    href: '/leads',
    value: (k) => k.newLeadsThisMonth,
    description: () => 'created this calendar month',
  },
  {
    key: 'leadConversionRate',
    label: 'Lead conversion rate',
    icon: 'Target',
    accent: 'violet',
    value: (k) => percent(k.leadConversionRate),
    description: () => 'converted vs. all-time leads',
  },
  {
    key: 'activePolicies',
    label: 'Active policies',
    icon: 'ShieldCheck',
    accent: 'navy',
    href: '/policies',
    value: (k) => k.activePolicies,
    description: () => 'bound, issued, or renewed',
  },
  {
    key: 'avgDealSize',
    label: 'Avg. deal size',
    icon: 'Wallet',
    accent: 'blue',
    value: (k) => formatNaira(k.avgDealSize),
    description: () => 'pipeline value ÷ open opportunities',
  },
  {
    key: 'lostThisMonthCount',
    label: 'Lost this month',
    icon: 'TrendingDown',
    accent: 'teal',
    value: (k) => k.lostThisMonthCount,
    description: () => 'opportunities marked lost',
  },
];

export const DEFAULT_KPI_TILE_KEYS = ['openOpportunities', 'pipelineValue', 'renewalsDueNext90Days', 'activeClients', 'wonThisMonthCount', 'winRate'];

/** Falls back to the default 6 when preferences are missing/empty, and silently drops any stale keys that no longer exist in the catalog (defensive against a future catalog change). */
export function resolveKpiTileKeys(preferences: string[] | null | undefined): string[] {
  if (!preferences || preferences.length === 0) return DEFAULT_KPI_TILE_KEYS;
  const validKeys = new Set(KPI_TILE_CATALOG.map((t) => t.key));
  const filtered = preferences.filter((k) => validKeys.has(k));
  return filtered.length > 0 ? filtered : DEFAULT_KPI_TILE_KEYS;
}

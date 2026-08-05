'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  BarChart3,
  ChartBarStacked,
  Funnel,
  GaugeCircle,
  Gauge,
  Landmark,
  LayoutGrid,
  LineChart,
  Megaphone,
  Shield,
  ShieldCheck,
  Table2,
  TrendingUp,
} from 'lucide-react';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@topiadesk/ui';
import { useReportCatalog } from '../_lib/hooks';
import type { ReportCategory, ReportChartType } from '../_lib/types';

const CATEGORY_ORDER: ReportCategory[] = ['FINANCE', 'SALES', 'RENEWALS', 'CLAIMS', 'COMPLIANCE', 'PRODUCTIVITY', 'MARKETING'];

const CATEGORY_ICON: Record<ReportCategory, ReactNode> = {
  FINANCE: <Landmark className="h-4 w-4" aria-hidden />,
  SALES: <TrendingUp className="h-4 w-4" aria-hidden />,
  RENEWALS: <BarChart3 className="h-4 w-4" aria-hidden />,
  CLAIMS: <Shield className="h-4 w-4" aria-hidden />,
  COMPLIANCE: <ShieldCheck className="h-4 w-4" aria-hidden />,
  PRODUCTIVITY: <Gauge className="h-4 w-4" aria-hidden />,
  MARKETING: <Megaphone className="h-4 w-4" aria-hidden />,
};

const CATEGORY_LABEL: Record<ReportCategory, string> = {
  FINANCE: 'Finance',
  SALES: 'Sales',
  RENEWALS: 'Renewals',
  CLAIMS: 'Claims',
  COMPLIANCE: 'Compliance',
  PRODUCTIVITY: 'Productivity',
  MARKETING: 'Marketing',
};

/** Icon + human label per chart type, so the catalog badge previews what
 * running the report will actually render (app/(reports)/_components/
 * report-chart.tsx) instead of the raw camelCase enum value. */
const CHART_TYPE_ICON: Record<ReportChartType, ReactNode> = {
  bar: <BarChart3 className="h-3 w-3" aria-hidden />,
  stackedBar: <ChartBarStacked className="h-3 w-3" aria-hidden />,
  line: <LineChart className="h-3 w-3" aria-hidden />,
  funnel: <Funnel className="h-3 w-3" aria-hidden />,
  table: <Table2 className="h-3 w-3" aria-hidden />,
  treemap: <LayoutGrid className="h-3 w-3" aria-hidden />,
  gauge: <GaugeCircle className="h-3 w-3" aria-hidden />,
};

const CHART_TYPE_LABEL: Record<ReportChartType, string> = {
  bar: 'Bar',
  stackedBar: 'Stacked bar',
  line: 'Line',
  funnel: 'Funnel',
  table: 'Table',
  treemap: 'Treemap',
  gauge: 'Gauge',
};

/**
 * Report catalog — every entry is fetched live from GET /api/reports (a
 * proxy for the backend's fixed report registry, see
 * packages/reports/src/definitions/), grouped by the category the backend
 * itself assigns. Nothing here is a hardcoded report list: add a
 * definition to the registry and it appears here automatically on the next
 * load.
 */
export function ReportsCatalogView() {
  const catalogQuery = useReportCatalog();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">Run any report against your own scoped data, or set one up for scheduled delivery.</p>
        </div>
        <Link href="/reports/scheduled" className="text-sm font-medium text-primary hover:underline">
          Scheduled reports →
        </Link>
      </div>

      {catalogQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      ) : catalogQuery.isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">Couldn&apos;t load the report catalog.</CardContent>
        </Card>
      ) : (
        CATEGORY_ORDER.filter((category) => catalogQuery.data?.some((r) => r.category === category)).map((category) => (
          <section key={category} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {CATEGORY_ICON[category]}
              {CATEGORY_LABEL[category]}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalogQuery.data!
                .filter((entry) => entry.category === category)
                .map((entry) => (
                  <Link key={entry.key} href={`/reports/${entry.key}`} className="block rounded-lg transition-shadow hover:shadow-brand-md">
                    <Card className="h-full">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{entry.name}</CardTitle>
                          <Badge variant="outline" className="shrink-0 gap-1">
                            {CHART_TYPE_ICON[entry.defaultChartType]}
                            {CHART_TYPE_LABEL[entry.defaultChartType]}
                          </Badge>
                        </div>
                        <CardDescription>{entry.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="text-xs text-muted-foreground">
                        {entry.measures.length} measure{entry.measures.length === 1 ? '' : 's'} · {entry.allowedDimensions.length} dimension
                        {entry.allowedDimensions.length === 1 ? '' : 's'}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

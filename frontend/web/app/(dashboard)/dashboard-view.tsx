'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase, TrendingUp, CalendarClock, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatTile, Skeleton } from '@topiadesk/ui';
import { formatNaira } from '@/app/(policy)/lib/format';
import { PipelineFunnelChart } from './pipeline-funnel-chart';
import { RenewalTimeline } from './renewal-timeline';
import type { PipelineFunnelResponse, RenewalRow } from './types';

interface OperationalKpis {
  openOpportunities: number;
  pipelineValue: string;
  renewalsDueNext90Days: number;
  activeClients: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Client Component doing the actual dashboard work: three independent
 * TanStack Query hooks against the same-origin app/api/dashboard/* proxies
 * (see that folder's route.ts files — StatTile icons are pre-rendered JSX
 * per packages/ui/src/composite/stat-tile.tsx's header comment, never a
 * bare component reference, to avoid the Server->Client serialization
 * crash documented there).
 */
export function DashboardView() {
  const kpisQuery = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () => fetchJson<OperationalKpis>('/api/dashboard/kpis'),
  });
  const funnelQuery = useQuery({
    queryKey: ['dashboard', 'pipeline-funnel'],
    queryFn: () => fetchJson<PipelineFunnelResponse>('/api/dashboard/pipeline-funnel'),
  });
  const renewalsQuery = useQuery({
    queryKey: ['dashboard', 'renewals'],
    queryFn: () => fetchJson<RenewalRow[]>('/api/dashboard/renewals'),
  });

  const kpis = kpisQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">TopiaDesk CRM</h1>
        <p className="text-sm text-muted-foreground">Operational overview — Corporate &amp; Retail Broking, Lagos HQ.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpisQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-lg" />)
        ) : kpisQuery.isError || !kpis ? (
          <Card className="sm:col-span-2 lg:col-span-4">
            <CardContent className="py-6 text-sm text-destructive">Couldn&apos;t load operational KPIs.</CardContent>
          </Card>
        ) : (
          <>
            <StatTile
              label="Open opportunities"
              value={kpis.openOpportunities}
              icon={<Briefcase />}
              description="active pipeline stages"
            />
            <StatTile
              label="Pipeline value"
              value={formatNaira(kpis.pipelineValue)}
              icon={<TrendingUp />}
              description="sum of open opportunities"
            />
            <StatTile
              label="Renewals due (90d)"
              value={kpis.renewalsDueNext90Days}
              icon={<CalendarClock />}
              description="across all policies"
            />
            <StatTile label="Active clients" value={kpis.activeClients} icon={<Users />} description="accounts on CLIENT status" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales pipeline</CardTitle>
            <CardDescription>Open opportunities by stage, current pipeline.</CardDescription>
          </CardHeader>
          <CardContent>
            {funnelQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : funnelQuery.isError || !funnelQuery.data ? (
              <p className="text-sm text-destructive">Couldn&apos;t load the pipeline.</p>
            ) : (
              <PipelineFunnelChart stages={funnelQuery.data.stages} pipelineName={funnelQuery.data.pipelineName} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Renewals</CardTitle>
            <CardDescription>Upcoming policy renewals, soonest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {renewalsQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : renewalsQuery.isError || !renewalsQuery.data ? (
              <p className="text-sm text-destructive">Couldn&apos;t load renewals.</p>
            ) : (
              <RenewalTimeline renewals={renewalsQuery.data} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

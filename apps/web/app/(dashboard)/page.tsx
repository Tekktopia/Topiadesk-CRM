import { Briefcase, FileClock, ShieldCheck, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatTile } from '@topiadesk/ui';

export const metadata = {
  title: 'Dashboard',
};

/**
 * Placeholder home page for the (dashboard) route group — the working
 * example Batch 2 agents copy the shape of for app/(crm)/, app/(policy)/,
 * app/(admin)/. The real operational dashboard (KPI tiles wired to live
 * data, pipeline funnel, renewal calendar) is Batch 2 Agent 2's
 * deliverable per the build plan; this is intentionally static so the
 * Phase-0 build has no dependency on a live API.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">TopiaDesk CRM</h1>
        <p className="text-sm text-muted-foreground">
          Operational overview — Corporate &amp; Retail Broking, Lagos HQ.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open opportunities"
          value={128}
          icon={<Briefcase />}
          trend={{ value: '+8 this week', direction: 'up' }}
        />
        <StatTile
          label="Active clients"
          value={342}
          icon={<Users />}
          trend={{ value: '+3 this week', direction: 'up' }}
        />
        <StatTile
          label="Renewals due (30d)"
          value={19}
          icon={<FileClock />}
          trend={{ value: '4 at risk', direction: 'up', positiveDirection: 'down' }}
        />
        <StatTile
          label="Policies in force"
          value="1,204"
          icon={<ShieldCheck />}
          description="across all lines of business"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            This route group (<code className="font-mono text-xs">app/(dashboard)/</code>) is the Phase-0 spine
            placeholder — see <code className="font-mono text-xs">app/(dashboard)/nav.ts</code> and{' '}
            <code className="font-mono text-xs">lib/nav-types.ts</code> for the nav-aggregation pattern, and{' '}
            <code className="font-mono text-xs">packages/ui/src/composite/stat-tile.tsx</code> for the composite
            component pattern.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Real CRM/Policy/Admin views (e.g. the Delta Oilfield Services Ltd account, its Property &amp;
          Engineering renewal, pipeline stages) land here in Batch 2.
        </CardContent>
      </Card>
    </div>
  );
}

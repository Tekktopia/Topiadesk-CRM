'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, CheckCircle2, LifeBuoy, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, StatTile, cn } from '@topiadesk/ui';
import { apiFetch } from './_lib/api';
import type { PlatformAuditLogEntry, PlatformStats, PlatformSupportTicket, TenantAdminSummary } from './_lib/types';
import { PageHeader } from './_components/page-header';

// Shared glass treatment for this page's Cards/StatTiles — see this
// session's plan for why this is a call-site className override rather
// than a Card/StatTile source change (their wrapper already forwards
// className via cn(), and editing packages/ui/src directly would leak
// into frontend/web, which shares this same component source).
const GLASS_PANEL = 'border-white/5 bg-card/60 backdrop-blur-xl';
const GLASS_TILE = cn(GLASS_PANEL, 'transition-shadow hover:shadow-glow-primary');

/**
 * Home dashboard — Phase 1 scope only (tenant counts by status, "top
 * actions" shortcuts), styled after the M365 admin center reference
 * screenshot's stat-tile-and-top-actions layout the user provided.
 * "Needs attention" is the first bit of live per-tenant signal on this
 * page — the composite health computed in tenants.controller.ts's
 * computeTenantHealth(), reused from the same admin-summary call the
 * Usage & Monitoring page already makes.
 */
export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: () => apiFetch<PlatformStats>('/api/stats'),
  });

  // No backend count endpoint for this — a dedicated client-side count,
  // same "reuse the list endpoint, count in the browser" approach the
  // Tenant Admins/Usage pages already take with admin-summary.
  const { data: openTickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ['support-tickets', 'status=OPEN'],
    queryFn: () => apiFetch<PlatformSupportTicket[]>('/api/support-tickets?status=OPEN'),
  });

  const { data: adminSummary, isLoading: healthLoading } = useQuery({
    queryKey: ['tenant-admin-summary'],
    queryFn: () => apiFetch<TenantAdminSummary[]>('/api/tenants/admin-summary'),
  });
  const needsAttention = (adminSummary ?? []).filter((t) => t.health !== 'HEALTHY').length;

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['platform-audit-log', 'limit=8'],
    queryFn: () => apiFetch<PlatformAuditLogEntry[]>('/api/audit-log?limit=8'),
  });

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Org at a glance"
        description="Every TopiaDesk customer organization, in one place."
        actions={
          <Button asChild>
            <Link href="/tenants?new=1">Create tenant</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <StatTile
          label="Total tenants"
          value={isLoading ? '—' : (data?.totalTenants ?? 0)}
          icon={<Building2 className="text-primary" />}
          className={GLASS_TILE}
        />
        <StatTile
          label="Active"
          value={isLoading ? '—' : (data?.active ?? 0)}
          icon={<CheckCircle2 className="text-success" />}
          className={cn(GLASS_TILE, 'hover:shadow-glow-success')}
        />
        <StatTile
          label="Provisioning"
          value={isLoading ? '—' : (data?.provisioning ?? 0)}
          icon={<Loader2 className="text-accent" />}
          className={cn(GLASS_TILE, 'hover:shadow-glow-accent')}
        />
        <StatTile
          label="Suspended / failed"
          value={isLoading ? '—' : (data?.suspended ?? 0) + (data?.failed ?? 0)}
          icon={<ShieldAlert className="text-destructive" />}
          description={data?.failed ? `${data.failed} failed` : undefined}
          className={cn(GLASS_TILE, 'hover:shadow-glow-destructive')}
        />
        <StatTile
          label="Needs attention"
          value={healthLoading ? '—' : needsAttention}
          icon={<AlertTriangle className="text-warning" />}
          description={needsAttention ? 'At risk or critical' : undefined}
          className={cn(GLASS_TILE, 'hover:shadow-glow-warning')}
        />
        <StatTile
          label="Open tickets"
          value={ticketsLoading ? '—' : (openTickets?.length ?? 0)}
          icon={<LifeBuoy className="text-primary" />}
          className={GLASS_TILE}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className={GLASS_PANEL}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Top actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" className="border border-white/5 bg-white/[0.04] hover:bg-white/[0.08]" asChild>
                <Link href="/tenants?new=1">
                  <Building2 className="mr-2 h-4 w-4 text-primary" />
                  Provision a new tenant
                </Link>
              </Button>
              <Button variant="secondary" className="border border-white/5 bg-white/[0.04] hover:bg-white/[0.08]" asChild>
                <Link href="/tenants">
                  <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
                  Review tenant status
                </Link>
              </Button>
              <Button variant="secondary" className="border border-white/5 bg-white/[0.04] hover:bg-white/[0.08]" asChild>
                <Link href="/admins?new=1">
                  <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
                  Add a platform admin
                </Link>
              </Button>
              <Button variant="secondary" className="border border-white/5 bg-white/[0.04] hover:bg-white/[0.08]" asChild>
                <Link href="/support-tickets?status=OPEN">
                  <LifeBuoy className="mr-2 h-4 w-4 text-warning" />
                  Review open tickets
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={GLASS_PANEL}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !activity || activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {activity.map((entry) => {
                  const row = (
                    <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-glow-primary" aria-hidden />
                        <span className="truncate rounded border border-white/5 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                          {entry.action}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{entry.actorName ?? 'System'}</span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                  );
                  return (
                    <li key={entry.id}>
                      {entry.entityType === 'tenants' ? (
                        <Link href={`/tenants/${entry.entityId}`} className="block hover:bg-white/[0.04]">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

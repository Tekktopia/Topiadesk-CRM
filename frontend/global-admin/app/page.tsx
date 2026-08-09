'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, LifeBuoy, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, StatTile } from '@topiadesk/ui';
import { apiFetch } from './_lib/api';
import type { PlatformAuditLogEntry, PlatformStats, PlatformSupportTicket } from './_lib/types';
import { PageHeader } from './_components/page-header';

/**
 * Home dashboard — Phase 1 scope only (tenant counts by status, "top
 * actions" shortcuts), styled after the M365 admin center reference
 * screenshot's stat-tile-and-top-actions layout the user provided. Live
 * per-tenant USAGE stats need Phase 2/3's cross-schema query work — see
 * the plan.
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

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['platform-audit-log', 'limit=8'],
    queryFn: () => apiFetch<PlatformAuditLogEntry[]>('/api/audit-log?limit=8'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Org at a glance"
        description="Every TopiaDesk customer organization, in one place."
        actions={
          <Button asChild>
            <Link href="/tenants?new=1">Create tenant</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatTile label="Total tenants" value={isLoading ? '—' : (data?.totalTenants ?? 0)} icon={<Building2 />} />
        <StatTile label="Active" value={isLoading ? '—' : (data?.active ?? 0)} icon={<CheckCircle2 />} />
        <StatTile label="Provisioning" value={isLoading ? '—' : (data?.provisioning ?? 0)} icon={<Loader2 />} />
        <StatTile label="Suspended / failed" value={isLoading ? '—' : (data?.suspended ?? 0) + (data?.failed ?? 0)} icon={<ShieldAlert />} description={data?.failed ? `${data.failed} failed` : undefined} />
        <StatTile label="Open tickets" value={ticketsLoading ? '—' : (openTickets?.length ?? 0)} icon={<LifeBuoy />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Top actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" asChild>
                <Link href="/tenants?new=1">
                  <Building2 className="mr-2 h-4 w-4" />
                  Provision a new tenant
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/tenants">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Review tenant status
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/admins?new=1">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Add a platform admin
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/support-tickets?status=OPEN">
                  <LifeBuoy className="mr-2 h-4 w-4" />
                  Review open tickets
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !activity || activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {activity.map((entry) => {
                  const row = (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-mono text-xs">{entry.action}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{entry.actorName ?? 'System'}</span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                  );
                  return (
                    <li key={entry.id}>
                      {entry.entityType === 'tenants' ? (
                        <Link href={`/tenants/${entry.entityId}`} className="block rounded-none hover:bg-secondary/50">
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

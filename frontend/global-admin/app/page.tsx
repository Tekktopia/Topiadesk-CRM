'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { Button, StatTile } from '@topiadesk/ui';
import { apiFetch } from './_lib/api';
import type { PlatformStats } from './_lib/types';

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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Org at a glance</h1>
          <p className="text-sm text-muted-foreground">Every TopiaDesk customer organization, in one place.</p>
        </div>
        <Button asChild>
          <Link href="/tenants?new=1">Create tenant</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Total tenants" value={isLoading ? '—' : (data?.totalTenants ?? 0)} icon={<Building2 />} />
        <StatTile label="Active" value={isLoading ? '—' : (data?.active ?? 0)} icon={<CheckCircle2 />} />
        <StatTile label="Provisioning" value={isLoading ? '—' : (data?.provisioning ?? 0)} icon={<Loader2 />} />
        <StatTile label="Suspended / failed" value={isLoading ? '—' : (data?.suspended ?? 0) + (data?.failed ?? 0)} icon={<ShieldAlert />} description={data?.failed ? `${data.failed} failed` : undefined} />
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Top actions</h2>
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
            <Link href="/plans">
              <XCircle className="mr-2 h-4 w-4" />
              Manage plans
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

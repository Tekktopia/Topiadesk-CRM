'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ShieldCheck, UserX, Users } from 'lucide-react';
import { StatTile } from '@topiadesk/ui';
import { apiFetch } from '../../_lib/api';
import type { TenantUsage } from '../../_lib/types';

export function UsageTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-usage', tenantId],
    queryFn: () => apiFetch<TenantUsage>(`/api/tenants/${tenantId}/usage`),
  });

  const seatsLabel = data?.seatLimit ? `${data.totalUsers} / ${data.seatLimit}` : (data?.totalUsers ?? '—');
  const atLimit = !!(data?.seatLimit && data.totalUsers >= data.seatLimit);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <StatTile
        label={data?.planName ? `Seats used (${data.planName})` : 'Total users'}
        value={isLoading ? '—' : seatsLabel}
        icon={atLimit ? <AlertTriangle /> : <Users />}
        description={atLimit ? 'At seat limit' : undefined}
      />
      <StatTile label="Active" value={isLoading ? '—' : (data?.activeUsers ?? 0)} icon={<CheckCircle2 />} />
      <StatTile label="Admins" value={isLoading ? '—' : (data?.adminCount ?? 0)} icon={<ShieldCheck />} />
      <StatTile label="Deactivated" value={isLoading ? '—' : (data?.deactivatedUsers ?? 0)} icon={<UserX />} />
      <StatTile label="Suspended" value={isLoading ? '—' : (data?.suspendedUsers ?? 0)} icon={<UserX />} />
    </div>
  );
}

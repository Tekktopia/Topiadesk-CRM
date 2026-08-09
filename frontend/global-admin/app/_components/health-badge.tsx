import { Badge } from '@topiadesk/ui';
import type { TenantHealth } from '../_lib/types';

const VARIANT: Record<TenantHealth, 'success' | 'warning' | 'destructive'> = {
  HEALTHY: 'success',
  AT_RISK: 'warning',
  CRITICAL: 'destructive',
};

const LABEL: Record<TenantHealth, string> = {
  HEALTHY: 'Healthy',
  AT_RISK: 'At risk',
  CRITICAL: 'Critical',
};

/** Composite risk signal computed by tenants.controller.ts's
 * computeTenantHealth() — see /platform/tenants/admin-summary and
 * /platform/tenants/:id/health. `reasons` renders as a native title
 * tooltip; empty when HEALTHY, so nothing is shown for the common case. */
export function HealthBadge({ health, reasons }: { health: TenantHealth; reasons: string[] }) {
  return (
    <Badge variant={VARIANT[health]} title={reasons.length ? reasons.join('; ') : undefined}>
      {LABEL[health]}
    </Badge>
  );
}

import { Badge } from '@topiadesk/ui';
import type { TenantStatus } from '../_lib/types';

const VARIANT: Record<TenantStatus, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  ACTIVE: 'success',
  PROVISIONING: 'warning',
  SUSPENDED: 'secondary',
  FAILED: 'destructive',
  DELETED: 'outline',
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}

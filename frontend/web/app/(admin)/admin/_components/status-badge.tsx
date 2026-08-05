import { Badge } from '@topiadesk/ui';

const USER_STATUS_VARIANT = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  DEACTIVATED: 'secondary',
} as const;

export function UserStatusBadge({ status }: { status: string }) {
  const variant = USER_STATUS_VARIANT[status as keyof typeof USER_STATUS_VARIANT] ?? 'outline';
  return <Badge variant={variant}>{status}</Badge>;
}

const SYNC_JOB_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  SUCCEEDED: 'success',
  COMPLETED: 'success',
  RUNNING: 'warning',
  PENDING: 'secondary',
  FAILED: 'destructive',
  PARTIAL: 'warning',
};

export function SyncJobStatusBadge({ status }: { status: string }) {
  const variant = SYNC_JOB_STATUS_VARIANT[status] ?? 'outline';
  return <Badge variant={variant}>{status}</Badge>;
}

const LOG_LEVEL_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  INFO: 'secondary',
  WARN: 'warning',
  WARNING: 'warning',
  ERROR: 'destructive',
  DEBUG: 'outline',
};

export function LogLevelBadge({ level }: { level: string }) {
  const variant = LOG_LEVEL_VARIANT[level] ?? 'outline';
  return <Badge variant={variant}>{level}</Badge>;
}

const AUDIT_ACTION_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'destructive',
  LOGIN: 'secondary',
  LOGIN_FAILED: 'destructive',
  PERMISSION_CHANGE: 'warning',
  EXPORT: 'outline',
  VIEW_SENSITIVE: 'outline',
  // Mutates Keycloak-side session state, same "identity-admin action, not a
  // CRUD mutation" grouping as PERMISSION_CHANGE — see users.controller.ts's
  // forceLogout().
  FORCE_LOGOUT: 'warning',
};

export function AuditActionBadge({ action }: { action: string }) {
  const variant = AUDIT_ACTION_VARIANT[action] ?? 'outline';
  return <Badge variant={variant}>{action}</Badge>;
}

const WEBHOOK_DELIVERY_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  PENDING: 'secondary',
  SUCCEEDED: 'success',
  FAILED: 'warning',
  EXHAUSTED: 'destructive',
};

export function WebhookDeliveryStatusBadge({ status }: { status: string }) {
  const variant = WEBHOOK_DELIVERY_STATUS_VARIANT[status] ?? 'outline';
  return <Badge variant={variant}>{status}</Badge>;
}

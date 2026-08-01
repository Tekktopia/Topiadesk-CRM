import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export interface RequiredPermission {
  resource: string;
  action: 'read' | 'write';
}

/**
 * Declares the app-layer authorization check for an endpoint — a coarse
 * "does this user hold ANY grant for resource+action, at any scope?" gate
 * that returns a clean 403 before touching business data. This is
 * deliberately NOT a full scope resolution (OWN/DEPARTMENT/BRANCH/ALL) —
 * that filtering happens automatically at the database layer via Postgres
 * RLS (prisma/rls/002_policies.sql), which cannot be bypassed even if this
 * guard has a bug. Two independent layers, two different jobs.
 */
export const RequirePermission = (resource: string, action: 'read' | 'write') =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { resource, action } satisfies RequiredPermission);

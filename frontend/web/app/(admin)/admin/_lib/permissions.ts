import type { AuthenticatedUser } from '@/lib/auth/types';

/**
 * UX-only visibility gating — the backend independently enforces the real
 * authorization via PermissionGuard + RLS regardless of what this hides or
 * shows (see backend/api/src/common/auth/permission.guard.ts and every
 * identity/integrations controller's @RequirePermission decorator). This
 * just avoids showing controls a user's mutation would immediately 403 on.
 *
 * Per packages/db/prisma/seed.ts: only ADMIN is granted identity:write:ALL
 * and integration:write:ALL. COMPLIANCE_OFFICER has identity:read:ALL
 * (oversight visibility) but no write grant. MANAGER/ACCOUNT_HANDLER have
 * no `identity`/`integration` grants at all, so the whole /admin/* section
 * 403s for them — pages render an access-denied state in that case (see
 * `_components/access-denied.tsx`) rather than a raw error.
 */
export function canWriteAdmin(user: AuthenticatedUser | null | undefined): boolean {
  return !!user?.roles.includes('ADMIN');
}

export function canReadAdmin(user: AuthenticatedUser | null | undefined): boolean {
  return !!user && (user.roles.includes('ADMIN') || user.roles.includes('COMPLIANCE_OFFICER'));
}

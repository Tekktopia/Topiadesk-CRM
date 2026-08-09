'use client';

import { useCurrentPlatformAdmin } from './use-current-platform-admin';

/**
 * Mirrors PlatformRoleGuard's own check — fails closed (false) while
 * loading/unauthenticated. This is Global Admin's first client-side
 * gating hook (informed by frontend/web's useCan()-style shape, not
 * literally reused — that pattern doesn't exist in this app yet).
 * Button-gating only: the real enforcement is PlatformRoleGuard server-
 * side, this just keeps the UI from offering an action that would 403.
 */
export function useIsSuperAdmin(): boolean {
  const { admin } = useCurrentPlatformAdmin();
  return admin?.role === 'SUPER_ADMIN';
}

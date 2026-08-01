'use client';

import { useQuery } from '@tanstack/react-query';
import type { AuthenticatedUser } from './types';

async function fetchCurrentUser(): Promise<AuthenticatedUser | null> {
  const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (!res.ok) return null;
  const body = (await res.json()) as { user: AuthenticatedUser | null };
  return body.user;
}

/**
 * Client-side hook exposing the authenticated user's identity + roles,
 * sourced from apps/api's GET /identity/me via the same-origin
 * `/api/auth/session` proxy (see app/api/auth/session/route.ts) — never
 * from a client-readable cookie or localStorage.
 *
 * Usage:
 *   const { user, isLoading } = useCurrentUser();
 *   if (user?.roles.includes('ADMIN')) { ... }
 */
export function useCurrentUser() {
  const query = useQuery({
    queryKey: ['auth', 'current-user'],
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
    retry: false,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

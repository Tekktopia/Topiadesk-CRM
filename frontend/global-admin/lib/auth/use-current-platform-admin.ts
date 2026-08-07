'use client';

import { useQuery } from '@tanstack/react-query';
import type { PlatformAdminUser } from './types';

async function fetchCurrentPlatformAdmin(): Promise<PlatformAdminUser | null> {
  const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (!res.ok) return null;
  const body = (await res.json()) as { user: PlatformAdminUser | null };
  return body.user;
}

export function useCurrentPlatformAdmin() {
  const query = useQuery({
    queryKey: ['auth', 'current-platform-admin'],
    queryFn: fetchCurrentPlatformAdmin,
    staleTime: 60_000,
    retry: false,
  });

  return { admin: query.data ?? null, isLoading: query.isLoading };
}

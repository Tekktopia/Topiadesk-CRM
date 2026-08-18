'use client';

import * as React from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AuthenticatedUser } from './types';

async function fetchCurrentUser(): Promise<AuthenticatedUser | null> {
  const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
  // 502 means the session route couldn't even REACH backend/api (see that
  // route's own comment) — a transient backend hiccup, not a real logout.
  // Throwing (not returning null) keeps TanStack Query's last known-good
  // `user` value in place instead of flashing every open page into a
  // false "you're logged out" state on a brief backend restart/blip.
  if (res.status === 502) {
    throw new Error('Could not reach backend to check the current session');
  }
  if (!res.ok) return null;
  const body = (await res.json()) as { user: AuthenticatedUser | null };
  return body.user;
}

interface CurrentUserValue {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  isError: boolean;
  refetch: UseQueryResult<AuthenticatedUser | null>['refetch'];
}

const CurrentUserContext = React.createContext<CurrentUserValue | undefined>(undefined);

/**
 * Owns the single `['auth', 'current-user']` query for the whole app —
 * mounted once from `Providers`. Found live: pages that called
 * `useCurrentUser()` a second time in their own tree (on top of
 * AppHeader/AppSidebar's calls) — e.g. the Accounts/Leads list views —
 * hit a sustained client-side re-render loop (thousands of DOM mutations/
 * sec, zero network activity) that pages calling it only once never did.
 * Root TanStack Query mechanism wasn't pinned down (ruled out: devtools,
 * DataTable internals, plain multi-observer — /dashboard has 3 concurrent
 * callers and never loops), but a single shared subscription sidesteps it
 * entirely and is the more correct shape regardless: one fetch, one cache
 * entry, every consumer reads the same object instead of re-subscribing.
 */
export function CurrentUserProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const query = useQuery({
    queryKey: ['auth', 'current-user'],
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
    retry: false,
  });

  const value = React.useMemo<CurrentUserValue>(
    () => ({
      user: query.data ?? null,
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: query.refetch,
    }),
    [query.data, query.isLoading, query.isError, query.refetch],
  );

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

/**
 * Client-side hook exposing the authenticated user's identity + roles,
 * sourced from backend/api's GET /identity/me via the same-origin
 * `/api/auth/session` proxy (see app/api/auth/session/route.ts) — never
 * from a client-readable cookie or localStorage. Backed by the single
 * query `CurrentUserProvider` owns (see its comment) — every caller reads
 * the same value rather than mounting its own subscription.
 *
 * Usage:
 *   const { user, isLoading } = useCurrentUser();
 *   if (user?.roles.includes('ADMIN')) { ... }
 */
export function useCurrentUser(): CurrentUserValue {
  const ctx = React.useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error('useCurrentUser must be used within CurrentUserProvider (see app/providers.tsx)');
  }
  return ctx;
}

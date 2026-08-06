'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Loader2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@topiadesk/ui';
import { apiFetch } from '../../_lib/api';

/**
 * Consumes the magic-link token client-side against
 * /api/portal/auth/consume (the Route Handler that sets the HttpOnly
 * portal_session cookie server-side — see that route's header comment for
 * why the raw token never touches this component's state). A same-origin
 * fetch's Set-Cookie response header is honored by the browser exactly like
 * a normal navigation would, so this doesn't need to be a Server Action.
 */
export function AuthConsumeView({ token }: { token: string }) {
  const router = useRouter();
  const attempted = useRef(false);
  const consumeMutation = useMutation({
    mutationFn: () => apiFetch<{ contactName: string; accountName: string }>('/api/portal/auth/consume', { method: 'POST', body: JSON.stringify({ token }) }),
    onSuccess: () => {
      router.replace('/portal');
      router.refresh();
    },
  });

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    consumeMutation.mutate();
    // Fires exactly once per mount — consumeMutation is stable enough for
    // this single-shot use and including it would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (consumeMutation.isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <XCircle className="h-10 w-10 text-destructive" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground">This sign-in link is invalid or has expired</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Sign-in links expire after 15 minutes and can only be used once. Request a new one to continue.
          </p>
          <a href="/portal/login" className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
            Request a new link
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </CardContent>
    </Card>
  );
}

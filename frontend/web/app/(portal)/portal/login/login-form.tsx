'use client';

import { useState, type FormEvent } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { Button, Card, CardContent, Input, Label } from '@topiadesk/ui';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../_lib/api';

export function PortalLoginForm() {
  const [email, setEmail] = useState('');
  const requestLinkMutation = useMutation({
    mutationFn: (value: string) => apiFetch<{ message: string }>('/api/portal/auth/request-link', { method: 'POST', body: JSON.stringify({ email: value }) }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    requestLinkMutation.mutate(email.trim());
  }

  if (requestLinkMutation.isSuccess) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground">Check your email</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            If {email.trim()} is on file, we&apos;ve sent a sign-in link. It expires in 15 minutes and can only be used once.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground">Sign in to your portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your email and we&apos;ll send you a sign-in link — no password needed.</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="portal-login-email">Email address</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="portal-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="pl-8"
                required
              />
            </div>
          </div>
          {requestLinkMutation.isError ? (
            <p className="text-sm text-destructive">{requestLinkMutation.error instanceof Error ? requestLinkMutation.error.message : 'Something went wrong — please try again.'}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={requestLinkMutation.isPending || email.trim().length === 0}>
            {requestLinkMutation.isPending ? 'Sending…' : 'Send sign-in link'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

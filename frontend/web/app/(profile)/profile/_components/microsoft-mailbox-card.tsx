'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarDays, Link2, Mailbox, RefreshCw, Unlink } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Skeleton,
  toast,
} from '@topiadesk/ui';
import { csrfHeaders } from '@/lib/csrf';

interface GraphConnectionStatus {
  connected: boolean;
  /** False when the deployment has no Microsoft credentials at all. */
  configured: boolean;
  microsoftUpn: string | null;
  status: 'CONNECTED' | 'NEEDS_RECONSENT' | 'DISABLED' | null;
  calendarSyncEnabled: boolean;
  mailSyncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Links a producer's own Microsoft 365 mailbox.
 *
 * Lives on the profile page, not in admin, because Graph consent is
 * delegated and per-user: each person authorises their own mailbox, and
 * nobody — including an admin — can connect it on their behalf.
 *
 * Calendar and mail are separate switches on purpose. Many producers will
 * want meetings captured on client records without their entire inbox
 * flowing into the CRM, and merging the two into one "connect" toggle would
 * force an all-or-nothing decision that most people answer with "no".
 */
export function MicrosoftMailboxCard() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [handledCallback, setHandledCallback] = useState(false);

  const query = useQuery({
    queryKey: ['profile', 'microsoft-connection'],
    queryFn: () => fetchJson<GraphConnectionStatus>('/api/integrations/microsoft/status'),
  });

  // The OAuth callback bounces back here with ?microsoft=connected|error.
  useEffect(() => {
    if (handledCallback) return;
    const result = searchParams.get('microsoft');
    if (!result) return;
    setHandledCallback(true);
    if (result === 'connected') {
      toast.success('Microsoft 365 mailbox connected');
      queryClient.invalidateQueries({ queryKey: ['profile', 'microsoft-connection'] });
    } else {
      toast.error('Could not connect the mailbox. Please try again.');
    }
  }, [searchParams, handledCallback, queryClient]);

  const toggle = useMutation({
    mutationFn: (body: { calendarSyncEnabled?: string; mailSyncEnabled?: string }) =>
      fetchJson<GraphConnectionStatus>('/api/integrations/microsoft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', 'microsoft-connection'] }),
    onError: () => toast.error('Could not update sync settings'),
  });

  const syncNow = useMutation({
    mutationFn: () =>
      fetchJson<{ results: unknown[] }>('/api/integrations/microsoft/sync', {
        method: 'POST',
        headers: csrfHeaders(),
      }),
    onSuccess: () => {
      toast.success('Sync complete');
      queryClient.invalidateQueries({ queryKey: ['profile', 'microsoft-connection'] });
    },
    onError: () => toast.error('Sync failed — try reconnecting the mailbox'),
  });

  const disconnect = useMutation({
    mutationFn: () =>
      fetchJson<{ disconnected: boolean }>('/api/integrations/microsoft', {
        method: 'DELETE',
        headers: csrfHeaders(),
      }),
    onSuccess: () => {
      toast.success('Mailbox disconnected');
      queryClient.invalidateQueries({ queryKey: ['profile', 'microsoft-connection'] });
    },
    onError: () => toast.error('Could not disconnect'),
  });

  const data = query.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mailbox className="h-4 w-4 text-muted-foreground" aria-hidden /> Microsoft 365
        </CardTitle>
        <CardDescription>
          Capture meetings and email with your clients automatically, so they appear on the client&apos;s timeline without
          being logged by hand.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data?.configured ? (
          // Distinguishes "you haven't connected" from "nobody on this
          // deployment can" — otherwise an admin chases a user problem that
          // is actually a missing app registration.
          <p className="text-sm text-muted-foreground">
            Microsoft 365 isn&apos;t set up on this system yet. Ask an administrator to add the Microsoft application
            credentials before connecting a mailbox.
          </p>
        ) : !data.connected ? (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your own mailbox. Only meetings and messages involving people already in the CRM are recorded —
              internal email and personal appointments are ignored.
            </p>
            <Button asChild>
              <a href="/api/integrations/microsoft/authorize">
                <Link2 aria-hidden /> Connect mailbox
              </a>
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{data.microsoftUpn}</span>
                <span className="text-xs text-muted-foreground">
                  {data.lastSyncedAt ? `Last synced ${new Date(data.lastSyncedAt).toLocaleString()}` : 'Not synced yet'}
                </span>
              </div>
              {data.status === 'NEEDS_RECONSENT' ? (
                <Badge variant="destructive">Reconnect needed</Badge>
              ) : (
                <Badge variant="success">Connected</Badge>
              )}
            </div>

            {data.status === 'NEEDS_RECONSENT' ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Microsoft revoked access, so syncing has stopped. Reconnect to resume.
                  {data.lastSyncError ? ` (${data.lastSyncError})` : ''}
                </span>
              </p>
            ) : null}

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Calendar — record meetings with clients
                </span>
                <Checkbox
                  checked={data.calendarSyncEnabled}
                  disabled={toggle.isPending}
                  onCheckedChange={(on) => toggle.mutate({ calendarSyncEnabled: on === true ? 'true' : 'false' })}
                />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Mailbox className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Email — record correspondence with clients
                </span>
                <Checkbox
                  checked={data.mailSyncEnabled}
                  disabled={toggle.isPending}
                  onCheckedChange={(on) => toggle.mutate({ mailSyncEnabled: on === true ? 'true' : 'false' })}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => syncNow.mutate()} disabled={syncNow.isPending}>
                <RefreshCw aria-hidden /> {syncNow.isPending ? 'Syncing…' : 'Sync now'}
              </Button>
              {data.status === 'NEEDS_RECONSENT' ? (
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/integrations/microsoft/authorize">
                    <Link2 aria-hidden /> Reconnect
                  </a>
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                <Unlink aria-hidden /> Disconnect
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Disconnecting removes your stored Microsoft credentials. Meetings and emails already recorded stay on the
              client timeline — they are a record of what happened, not a copy of your mailbox.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

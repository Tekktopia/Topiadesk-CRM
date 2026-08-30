'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Inbox, Mail, Plug, Send } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { ErrorState } from '../_components/query-states';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type {
  InboundMailboxSettings,
  MailProvider,
  MailSettings,
  UpsertInboundMailboxSettingsInput,
  UpsertMailSettingsInput,
} from '../_lib/types';

/**
 * IMAP host/port presets — same "label to save a lookup" purpose as the
 * outbound PRESETS table below, for the three mailbox providers a tenant is
 * overwhelmingly likely to already have.
 */
const IMAP_PRESETS: Record<'GMAIL' | 'MICROSOFT365' | 'CUSTOM', { label: string; host: string; port: number; secure: boolean; hint: string }> = {
  GMAIL: {
    label: 'Gmail / Google Workspace',
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    hint: 'Needs an App Password (2-Step Verification must be on) — your normal Google password will not work here.',
  },
  MICROSOFT365: {
    label: 'Microsoft 365 / Outlook',
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    hint: 'Requires IMAP enabled on the mailbox and, if MFA is on, an app password.',
  },
  CUSTOM: { label: 'Custom IMAP', host: '', port: 993, secure: true, hint: 'Any IMAP server.' },
};

/**
 * Host/port presets.
 *
 * The provider is only a LABEL — every option below is plain SMTP, so this
 * table exists purely to save an admin looking up settings. `secure` is not
 * derivable from the port: several providers offer both 465 (implicit TLS)
 * and 587 (STARTTLS), so it is stated explicitly per preset.
 */
const PRESETS: Record<MailProvider, { label: string; host: string; port: number; secure: boolean; hint: string }> = {
  BREVO: {
    label: 'Brevo',
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    hint: 'Free tier around 300 emails/day. Use the SMTP key from Brevo, not your account password.',
  },
  SENDGRID: {
    label: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    hint: 'Username is literally the word "apikey"; the password is your API key.',
  },
  MAILJET: {
    label: 'Mailjet',
    host: 'in-v3.mailjet.com',
    port: 587,
    secure: false,
    hint: 'Username is your API key, password is your secret key.',
  },
  MICROSOFT365: {
    label: 'Microsoft 365',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    hint: 'Requires SMTP AUTH enabled on the mailbox. Sends from your own domain with your existing reputation.',
  },
  GOOGLE_WORKSPACE: {
    label: 'Google Workspace',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    hint: 'Needs an App Password (2-Step Verification must be on). Daily send limits apply.',
  },
  AMAZON_SES: {
    label: 'Amazon SES',
    host: 'email-smtp.eu-west-1.amazonaws.com',
    port: 587,
    secure: false,
    hint: 'Use SES SMTP credentials (not your AWS access keys), and set the host to your own region.',
  },
  CUSTOM: { label: 'Custom SMTP', host: '', port: 587, secure: false, hint: 'Any SMTP server.' },
};

export default function MailSettingsPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'mail-settings'],
    queryFn: () => apiFetch<MailSettings>('/api/admin/mail-settings'),
  });

  const inboundQuery = useQuery({
    queryKey: ['admin', 'inbound-email'],
    queryFn: () => apiFetch<InboundMailboxSettings>('/api/admin/inbound-email'),
  });
  const inboundSettings = inboundQuery.data;

  const [inboundPreset, setInboundPreset] = useState<'GMAIL' | 'MICROSOFT365' | 'CUSTOM'>('GMAIL');
  const [inboundHost, setInboundHost] = useState('');
  const [inboundPort, setInboundPort] = useState('993');
  const [inboundSecure, setInboundSecure] = useState(true);
  const [inboundUsername, setInboundUsername] = useState('');
  const [inboundPassword, setInboundPassword] = useState('');
  const [inboundActive, setInboundActive] = useState(false);

  useEffect(() => {
    if (!inboundSettings?.configured) return;
    setInboundHost(inboundSettings.host ?? '');
    setInboundPort(String(inboundSettings.port ?? 993));
    setInboundSecure(inboundSettings.secure);
    setInboundUsername(inboundSettings.username ?? '');
    setInboundActive(inboundSettings.isActive);
    setInboundPassword('');
  }, [inboundSettings]);

  function applyInboundPreset(next: 'GMAIL' | 'MICROSOFT365' | 'CUSTOM') {
    setInboundPreset(next);
    const preset = IMAP_PRESETS[next];
    if (preset.host) {
      setInboundHost(preset.host);
      setInboundPort(String(preset.port));
      setInboundSecure(preset.secure);
    }
  }

  const saveInbound = useMutation({
    mutationFn: (input: UpsertInboundMailboxSettingsInput) =>
      apiFetch<InboundMailboxSettings>('/api/admin/inbound-email', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbound-email'] });
      toast.success('Inbound mailbox settings saved');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not save the inbound mailbox settings'),
  });

  const testInbound = useMutation({
    mutationFn: () => apiFetch<{ connected: boolean; error: string | null }>('/api/admin/inbound-email/test', { method: 'POST' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbound-email'] });
      if (res.connected) toast.success('Connected — the mailbox is reachable');
      else toast.error(`Connection failed: ${res.error ?? 'unknown error'}`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Test failed'),
  });

  function submitInbound() {
    saveInbound.mutate({
      host: inboundHost,
      port: Number(inboundPort),
      secure: inboundSecure,
      username: inboundUsername,
      ...(inboundPassword ? { password: inboundPassword } : {}),
      isActive: inboundActive,
    });
  }

  const [provider, setProvider] = useState<MailProvider>('BREVO');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [testTo, setTestTo] = useState('');

  const settings = query.data;

  useEffect(() => {
    if (!settings?.configured) return;
    setProvider(settings.provider ?? 'CUSTOM');
    setHost(settings.host ?? '');
    setPort(String(settings.port ?? 587));
    setSecure(settings.secure);
    setUsername(settings.username ?? '');
    setFromName(settings.fromName ?? '');
    setFromEmail(settings.fromEmail ?? '');
    setReplyToEmail(settings.replyToEmail ?? '');
    setIsActive(settings.isActive);
    // Password is intentionally left blank — the API never returns it, and an
    // empty field means "keep what is stored".
    setPassword('');
  }, [settings]);

  function applyPreset(next: MailProvider) {
    setProvider(next);
    const preset = PRESETS[next];
    if (preset.host) {
      setHost(preset.host);
      setPort(String(preset.port));
      setSecure(preset.secure);
    }
  }

  const save = useMutation({
    mutationFn: (input: UpsertMailSettingsInput) =>
      apiFetch<MailSettings>('/api/admin/mail-settings', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'mail-settings'] });
      toast.success('Mail settings saved');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not save mail settings'),
  });

  const test = useMutation({
    mutationFn: (to: string) =>
      apiFetch<{ delivered: boolean; error: string | null }>('/api/admin/mail-settings/test', {
        method: 'POST',
        body: JSON.stringify({ to }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'mail-settings'] });
      if (res.delivered) toast.success('Test message sent — check the inbox');
      else toast.error(`Delivery failed: ${res.error ?? 'unknown error'}`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Test failed'),
  });

  function submit() {
    save.mutate({
      provider,
      host,
      port: Number(port),
      secure,
      username: username || undefined,
      // Only send the password when the admin actually typed one — an empty
      // field must not wipe the stored credential.
      ...(password ? { password } : {}),
      fromName,
      fromEmail,
      replyToEmail: replyToEmail || undefined,
      isActive,
    });
  }

  if (query.isError) return <ErrorState error={query.error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email"
        description="Where this organisation's email is sent from, and where a customer's email turns into a ticket."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden /> Inbound Email
            </CardTitle>
            <CardDescription className="mt-1">
              Connect a mailbox and any email sent to it becomes a ticket here automatically — replies thread onto the
              same ticket instead of creating a new one each time. No DNS changes, no separate provider account — just
              the mailbox's own login.
            </CardDescription>
          </div>
          {inboundSettings?.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="outline">Off</Badge>
          )}
        </CardHeader>
        {inboundSettings?.lastPolledAt ? (
          <CardContent className="pt-0">
            {inboundSettings.lastPollError ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>Last poll failed: {inboundSettings.lastPollError}</span>
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                Last checked {new Date(inboundSettings.lastPolledAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        ) : null}
        <CardContent className="space-y-4">
          {inboundQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Mailbox provider</Label>
                  <Select value={inboundPreset} onValueChange={(v) => applyInboundPreset(v as typeof inboundPreset)} disabled={!canWrite}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(IMAP_PRESETS) as (keyof typeof IMAP_PRESETS)[]).map((p) => (
                        <SelectItem key={p} value={p}>{IMAP_PRESETS[p].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{IMAP_PRESETS[inboundPreset].hint}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inbound-username">Email address</Label>
                  <Input
                    id="inbound-username"
                    value={inboundUsername}
                    onChange={(e) => setInboundUsername(e.target.value)}
                    placeholder="support@yourdomain.com"
                    disabled={!canWrite}
                  />
                  <p className="text-xs text-muted-foreground">Also what customers should be told to email.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inbound-host">IMAP host</Label>
                  <Input id="inbound-host" value={inboundHost} onChange={(e) => setInboundHost(e.target.value)} disabled={!canWrite} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inbound-port">Port</Label>
                  <Input
                    id="inbound-port"
                    inputMode="numeric"
                    value={inboundPort}
                    onChange={(e) => setInboundPort(e.target.value)}
                    disabled={!canWrite}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Encryption</Label>
                  <Select value={inboundSecure ? 'ssl' : 'starttls'} onValueChange={(v) => setInboundSecure(v === 'ssl')} disabled={!canWrite}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ssl">SSL/TLS (usually port 993)</SelectItem>
                      <SelectItem value="starttls">STARTTLS (usually port 143)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inbound-pass">Password / app password</Label>
                  <Input
                    id="inbound-pass"
                    type="password"
                    value={inboundPassword}
                    onChange={(e) => setInboundPassword(e.target.value)}
                    placeholder={inboundSettings?.hasPassword ? '•••••••• (leave blank to keep)' : ''}
                    disabled={!canWrite}
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored encrypted and never shown again. Leave blank to keep the current one.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={inboundActive ? 'on' : 'off'} onValueChange={(v) => setInboundActive(v === 'on')} disabled={!canWrite}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on">Active — check this mailbox for new tickets</SelectItem>
                      <SelectItem value="off">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {canWrite ? (
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => testInbound.mutate()}
                    disabled={testInbound.isPending || !inboundSettings?.configured}
                  >
                    <Plug aria-hidden /> {testInbound.isPending ? 'Testing…' : 'Test connection'}
                  </Button>
                  <Button onClick={submitInbound} disabled={saveInbound.isPending || !inboundHost || !inboundUsername}>
                    {saveInbound.isPending ? 'Saving…' : 'Save inbound settings'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <h2 className="pt-2 text-sm font-semibold text-foreground">Outbound Email</h2>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4 text-muted-foreground" aria-hidden /> Currently sending via
                </CardTitle>
                <CardDescription className="mt-1 font-mono text-xs">{settings?.effectiveTransport}</CardDescription>
              </div>
              {settings?.isActive ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="outline">Using environment defaults</Badge>
              )}
            </CardHeader>
            {settings?.lastTestedAt ? (
              <CardContent className="pt-0">
                {settings.lastTestError ? (
                  <p className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      Last test failed: {settings.lastTestError}
                    </span>
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                    Last test succeeded on {new Date(settings.lastTestedAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mail provider</CardTitle>
              <CardDescription>{PRESETS[provider].hint}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Select value={provider} onValueChange={(v) => applyPreset(v as MailProvider)} disabled={!canWrite}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRESETS) as MailProvider[]).map((p) => (
                        <SelectItem key={p} value={p}>{PRESETS[p].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mail-host">SMTP host</Label>
                  <Input id="mail-host" value={host} onChange={(e) => setHost(e.target.value)} disabled={!canWrite} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mail-port">Port</Label>
                  <Input id="mail-port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} disabled={!canWrite} />
                </div>
                <div className="space-y-1.5">
                  <Label>Encryption</Label>
                  <Select value={secure ? 'ssl' : 'starttls'} onValueChange={(v) => setSecure(v === 'ssl')} disabled={!canWrite}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starttls">STARTTLS (usually port 587)</SelectItem>
                      <SelectItem value="ssl">SSL/TLS (usually port 465)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mail-user">Username</Label>
                  <Input id="mail-user" value={username} onChange={(e) => setUsername(e.target.value)} disabled={!canWrite} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mail-pass">Password / API key</Label>
                  <Input
                    id="mail-pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={settings?.hasPassword ? '•••••••• (leave blank to keep)' : ''}
                    disabled={!canWrite}
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored encrypted and never shown again. Leave blank to keep the current one.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mail-from-name">From name</Label>
                  <Input id="mail-from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="SCIB Nigeria" disabled={!canWrite} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mail-from-email">From address</Label>
                  <Input id="mail-from-email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="no-reply@yourdomain.com" disabled={!canWrite} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mail-reply">Reply-to (optional)</Label>
                  <Input id="mail-reply" value={replyToEmail} onChange={(e) => setReplyToEmail(e.target.value)} placeholder="support@yourdomain.com" disabled={!canWrite} />
                  <p className="text-xs text-muted-foreground">
                    Where client replies go. Point this at a monitored mailbox rather than a no-reply address.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={isActive ? 'on' : 'off'} onValueChange={(v) => setIsActive(v === 'on')} disabled={!canWrite}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on">Active — send through these settings</SelectItem>
                      <SelectItem value="off">Inactive — use environment defaults</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="text-sm font-medium text-foreground">Before going live</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Verify your sending domain with the provider and publish the SPF and DKIM records it gives you. A successful
                  test below proves the server accepted the message — it does not prove it will reach an inbox. Without those
                  DNS records, mail to clients is likely to be filtered as spam.
                </p>
              </div>

              {canWrite ? (
                <div className="flex justify-end">
                  <Button onClick={submit} disabled={save.isPending || !host || !fromEmail || !fromName}>
                    {save.isPending ? 'Saving…' : 'Save settings'}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Send a test message</CardTitle>
              <CardDescription>
                Sends through the saved settings, so it also proves the stored password still works.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="w-full space-y-1.5 sm:w-80">
                <Label htmlFor="mail-test-to">Send to</Label>
                <Input id="mail-test-to" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@yourdomain.com" disabled={!canWrite} />
              </div>
              <Button
                variant="outline"
                onClick={() => test.mutate(testTo)}
                disabled={!canWrite || test.isPending || !testTo || !settings?.configured}
              >
                <Send aria-hidden /> {test.isPending ? 'Sending…' : 'Send test'}
              </Button>
              {!settings?.configured ? (
                <p className="text-sm text-muted-foreground">Save settings first.</p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

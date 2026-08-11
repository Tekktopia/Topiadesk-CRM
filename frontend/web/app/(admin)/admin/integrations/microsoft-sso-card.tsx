'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { ConfirmDialog } from '../_components/confirm-dialog';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { MicrosoftSsoDto, UpsertMicrosoftSsoBody } from '../_lib/types';

const QUERY_KEY = ['admin', 'sso', 'microsoft'];

/**
 * Per-tenant "Sign in with Microsoft 365" self-service config — the
 * setup instructions here (redirect URI shown before anything's saved,
 * since it only depends on this tenant's own Keycloak realm) are the
 * actual walkthrough for creating the Azure App Registration, not just
 * a one-time chat explanation. Lives on the Integrations page rather
 * than a new nav entry — same "connect to an external Microsoft-adjacent
 * system" mental model as the Teams connector already here.
 */
export function MicrosoftSsoCard() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => apiFetch<MicrosoftSsoDto>('/api/admin/sso/microsoft') });
  const [editing, setEditing] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(false);
  const [copied, setCopied] = useState(false);

  const upsertMutation = useMutation({
    mutationFn: (body: UpsertMicrosoftSsoBody) => apiFetch<MicrosoftSsoDto>('/api/admin/sso/microsoft', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Microsoft 365 sign-in saved');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save Microsoft 365 sign-in'),
  });

  const removeMutation = useMutation({
    mutationFn: () => apiFetch<void>('/api/admin/sso/microsoft', { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Microsoft 365 sign-in removed');
      setPendingRemove(false);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to remove Microsoft 365 sign-in'),
  });

  async function handleCopy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">Couldn&apos;t load Microsoft 365 sign-in settings.</CardContent>
      </Card>
    );
  }

  const config = query.data;
  const showForm = editing || !config.configured;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Single Sign-On — Microsoft 365
          </CardTitle>
          {config.configured && !editing ? (
            <Badge variant={config.isEnabled ? 'success' : 'secondary'}>{config.isEnabled ? 'Enabled' : 'Disabled'}</Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm ? (
            <MicrosoftSsoForm
              config={config}
              canWrite={canWrite}
              isPending={upsertMutation.isPending}
              onSubmit={(body) => upsertMutation.mutate(body)}
              onCancel={config.configured ? () => setEditing(false) : undefined}
              onCopyRedirectUri={() => handleCopy(config.redirectUri)}
              copied={copied}
            />
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1 text-sm">
                <p className="text-foreground">
                  Tenant ID: <span className="font-mono text-xs text-muted-foreground">{config.azureTenantId}</span>
                </p>
                <p className="text-foreground">
                  Client ID: <span className="font-mono text-xs text-muted-foreground">{config.azureClientId}</span>
                </p>
              </div>
              {canWrite ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={upsertMutation.isPending}
                    onClick={() =>
                      upsertMutation.mutate({
                        azureTenantId: config.azureTenantId!,
                        azureClientId: config.azureClientId!,
                        isEnabled: !config.isEnabled,
                      })
                    }
                  >
                    {config.isEnabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Edit Microsoft 365 sign-in" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Remove Microsoft 365 sign-in" onClick={() => setPendingRemove(true)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingRemove}
        onOpenChange={setPendingRemove}
        title="Remove Microsoft 365 sign-in?"
        description="Users who sign in with Microsoft will no longer be able to — they'll need to use their regular TopiaDesk credentials instead. This removes the identity provider from Keycloak, not just this saved config."
        confirmLabel="Remove"
        destructive
        isPending={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate()}
      />
    </>
  );
}

function MicrosoftSsoForm({
  config,
  canWrite,
  isPending,
  onSubmit,
  onCancel,
  onCopyRedirectUri,
  copied,
}: {
  config: MicrosoftSsoDto;
  canWrite: boolean;
  isPending: boolean;
  onSubmit: (body: UpsertMicrosoftSsoBody) => void;
  onCancel?: () => void;
  onCopyRedirectUri: () => void;
  copied: boolean;
}) {
  const [azureTenantId, setAzureTenantId] = useState(config.azureTenantId ?? '');
  const [azureClientId, setAzureClientId] = useState(config.azureClientId ?? '');
  const [azureClientSecret, setAzureClientSecret] = useState('');

  useEffect(() => {
    setAzureTenantId(config.azureTenantId ?? '');
    setAzureClientId(config.azureClientId ?? '');
    setAzureClientSecret('');
  }, [config]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      azureTenantId,
      azureClientId,
      azureClientSecret: azureClientSecret || undefined,
      isEnabled: config.isEnabled,
    });
  }

  return (
    <div className="space-y-4">
      {!config.configured ? (
        <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
          <li>
            In the{' '}
            <a href="https://portal.azure.com" target="_blank" rel="noreferrer" className="underline">
              Azure Portal
            </a>
            , go to <span className="text-foreground">Microsoft Entra ID → App registrations → New registration</span>.
          </li>
          <li>Under &quot;Redirect URI,&quot; add the value below as a Web platform redirect.</li>
          <li>
            Note the <span className="text-foreground">Application (client) ID</span> and{' '}
            <span className="text-foreground">Directory (tenant) ID</span> from the app&apos;s Overview page.
          </li>
          <li>
            Under <span className="text-foreground">Certificates &amp; secrets</span>, create a new client secret and copy its value
            immediately — Azure only shows it once.
          </li>
          <li>The default <span className="font-mono text-xs">User.Read</span> delegated permission is sufficient — no extra API permissions needed.</li>
        </ol>
      ) : null}

      <div className="space-y-1.5">
        <Label>Redirect URI to give Azure</Label>
        <div className="flex gap-2">
          <Input readOnly value={config.redirectUri} className="font-mono text-xs" />
          <Button type="button" variant="outline" size="icon" aria-label="Copy redirect URI" onClick={onCopyRedirectUri}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {canWrite ? (
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ms-sso-tenant-id">Directory (tenant) ID</Label>
              <Input id="ms-sso-tenant-id" value={azureTenantId} onChange={(e) => setAzureTenantId(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-sso-client-id">Application (client) ID</Label>
              <Input id="ms-sso-client-id" value={azureClientId} onChange={(e) => setAzureClientId(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-sso-client-secret">
              <span className="inline-flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" aria-hidden /> Client secret
              </span>
            </Label>
            <Input
              id="ms-sso-client-secret"
              type="password"
              value={azureClientSecret}
              onChange={(e) => setAzureClientSecret(e.target.value)}
              placeholder={config.configured ? 'Leave blank to keep the current secret' : undefined}
              required={!config.configured}
            />
          </div>
          <div className="flex justify-end gap-2">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" disabled={isPending || !azureTenantId || !azureClientId}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

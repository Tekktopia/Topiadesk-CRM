'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, X } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, toast } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import { useRoles } from '../_lib/queries';
import type { OrgSettingDto, SetOrgSettingBody } from '../_lib/types';

function useSetOrgSetting(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetOrgSettingBody) =>
      apiFetch<OrgSettingDto>(`/api/admin/org-settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Setting saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'org-settings'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save setting'),
  });
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export function RenewalThresholdsCard({ setting, canWrite }: { setting: OrgSettingDto | undefined; canWrite: boolean }) {
  const initial = isNumberArray(setting?.value) ? setting.value : [];
  const [thresholds, setThresholds] = useState<number[]>(initial);
  const [draft, setDraft] = useState('');
  const mutation = useSetOrgSetting('renewal.default_alert_thresholds_days');

  useEffect(() => {
    setThresholds(isNumberArray(setting?.value) ? [...setting.value].sort((a, b) => b - a) : []);
  }, [setting]);

  function addThreshold() {
    const n = Number(draft);
    if (!Number.isInteger(n) || n <= 0 || thresholds.includes(n)) return;
    setThresholds([...thresholds, n].sort((a, b) => b - a));
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addThreshold();
    }
  }

  const dirty = JSON.stringify(thresholds) !== JSON.stringify(isNumberArray(setting?.value) ? [...setting.value].sort((a, b) => b - a) : []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Renewal alert thresholds</CardTitle>
        <CardDescription>
          <code className="font-mono text-xs">renewal.default_alert_thresholds_days</code> — days before expiry that
          trigger a renewal notification (e.g. 90/60/30/7 days out).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {thresholds.length === 0 ? (
            <span className="text-sm text-muted-foreground">No thresholds configured.</span>
          ) : (
            thresholds.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 pr-1">
                {t}d
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={`Remove ${t} day threshold`}
                    className="rounded-sm hover:bg-muted"
                    onClick={() => setThresholds(thresholds.filter((x) => x !== t))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </Badge>
            ))
          )}
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              placeholder="Add days, e.g. 45"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-40"
            />
            <Button type="button" variant="outline" size="sm" onClick={addThreshold} disabled={!draft}>
              Add
            </Button>
          </div>
        ) : null}
      </CardContent>
      {canWrite ? (
        <CardFooter>
          <Button size="sm" disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate({ value: thresholds })}>
            {mutation.isPending ? 'Saving…' : 'Save thresholds'}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function MfaRolesCard({ setting, canWrite }: { setting: OrgSettingDto | undefined; canWrite: boolean }) {
  const rolesQuery = useRoles();
  const initial = isStringArray(setting?.value) ? setting.value : [];
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const mutation = useSetOrgSetting('security.mfa_required_roles');

  useEffect(() => {
    setSelected(new Set(isStringArray(setting?.value) ? setting.value : []));
  }, [setting]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const original = new Set(isStringArray(setting?.value) ? setting.value : []);
  const dirty = selected.size !== original.size || [...selected].some((r) => !original.has(r));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden />
          MFA-required roles
        </CardTitle>
        <CardDescription>
          <code className="font-mono text-xs">security.mfa_required_roles</code> — roles for which multi-factor
          authentication is mandatory at sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rolesQuery.data?.map((role) => (
          <label key={role.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={selected.has(role.name)}
              disabled={!canWrite}
              onChange={() => toggle(role.name)}
            />
            {role.name}
          </label>
        ))}
      </CardContent>
      {canWrite ? (
        <CardFooter>
          <Button size="sm" disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate({ value: [...selected] })}>
            {mutation.isPending ? 'Saving…' : 'Save MFA roles'}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

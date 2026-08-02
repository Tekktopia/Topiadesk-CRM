'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Settings as SettingsIcon } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { PageHeader } from '../_components/page-header';
import { ErrorState } from '../_components/query-states';
import { apiFetch } from '../_lib/api';
import { canWriteAdmin } from '../_lib/permissions';
import type { OrgSettingDto } from '../_lib/types';
import { RenewalThresholdsCard, MfaRolesCard } from './known-setting-editors';
import { GenericSettingDialog } from './generic-setting-dialog';

const KNOWN_KEYS = new Set(['renewal.default_alert_thresholds_days', 'security.mfa_required_roles']);

export default function OrgSettingsPage() {
  const { user: currentUser } = useCurrentUser();
  const canWrite = canWriteAdmin(currentUser);

  const settingsQuery = useQuery({
    queryKey: ['admin', 'org-settings'],
    queryFn: () => apiFetch<OrgSettingDto[]>('/api/admin/org-settings'),
  });

  const [genericTarget, setGenericTarget] = useState<'create' | OrgSettingDto | null>(null);

  const renewalThresholds = settingsQuery.data?.find((s) => s.key === 'renewal.default_alert_thresholds_days');
  const mfaRoles = settingsQuery.data?.find((s) => s.key === 'security.mfa_required_roles');
  const otherSettings = (settingsQuery.data ?? []).filter((s) => !KNOWN_KEYS.has(s.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Org Settings"
        description="A generic key/value store (identity.org_settings) — the two keys below are seeded and rendered with dedicated editors; anything else uses a raw JSON editor since the backend doesn't hardcode which keys exist."
        actions={
          canWrite ? (
            <Button size="sm" variant="outline" onClick={() => setGenericTarget('create')}>
              <Plus className="h-4 w-4" /> Add setting
            </Button>
          ) : undefined
        }
      />

      {settingsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : settingsQuery.isError ? (
        <ErrorState error={settingsQuery.error} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RenewalThresholdsCard setting={renewalThresholds} canWrite={canWrite} />
            <MfaRolesCard setting={mfaRoles} canWrite={canWrite} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                Other settings
              </CardTitle>
              <CardDescription>Any additional key/value entries, shown and edited as raw JSON.</CardDescription>
            </CardHeader>
            <CardContent>
              {otherSettings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other settings configured.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Updated</TableHead>
                        {canWrite ? <TableHead className="w-16" /> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {otherSettings.map((s) => (
                        <TableRow key={s.key} className={canWrite ? 'cursor-pointer' : undefined} onClick={() => canWrite && setGenericTarget(s)}>
                          <TableCell className="font-mono text-xs text-foreground">{s.key}</TableCell>
                          <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                            {JSON.stringify(s.value)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(s.updatedAt).toLocaleString()}
                          </TableCell>
                          {canWrite ? (
                            <TableCell>
                              <Button size="sm" variant="outline">
                                Edit
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {genericTarget ? (
        <GenericSettingDialog
          target={genericTarget}
          open={!!genericTarget}
          onOpenChange={(open) => !open && setGenericTarget(null)}
        />
      ) : null}
    </div>
  );
}

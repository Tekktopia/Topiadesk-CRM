'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { ConnectorDto, ConnectorType, CreateConnectorBody, SyncDirection } from '../_lib/types';

const CONNECTOR_TYPES: { value: ConnectorType; label: string }[] = [
  { value: 'TEAMS_WEBHOOK', label: 'Microsoft Teams (channel webhook)' },
  { value: 'SEAMLESSHR', label: 'SeamlessHR (employee sync)' },
  { value: 'MOCK_STUB', label: 'Mock stub (testing)' },
  { value: 'CORE_BROKING_SYSTEM', label: 'Core broking system' },
  { value: 'ERP', label: 'ERP' },
];
const SYNC_DIRECTIONS: SyncDirection[] = ['INBOUND', 'OUTBOUND', 'BIDIRECTIONAL'];
const MASKED = '••••••••';

interface FormState {
  name: string;
  connectorType: ConnectorType;
  syncDirection: SyncDirection;
  isEnabled: boolean;
  pollingIntervalMinutes: string;
  webhookPath: string;
  // config fields, by connectorType
  webhookUrl: string;
  seamlessApiBaseUrl: string;
  seamlessApiKey: string;
  fixtureEndpoint: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    connectorType: 'TEAMS_WEBHOOK',
    syncDirection: 'OUTBOUND',
    isEnabled: true,
    pollingIntervalMinutes: '',
    webhookPath: '',
    webhookUrl: '',
    seamlessApiBaseUrl: '',
    seamlessApiKey: '',
    fixtureEndpoint: '',
  };
}

function fromConnector(c: ConnectorDto): FormState {
  const config = c.config ?? {};
  const seamlessHR = (config.seamlessHR as Record<string, unknown> | undefined) ?? {};
  return {
    name: c.name,
    connectorType: c.connectorType,
    syncDirection: c.syncDirection,
    isEnabled: c.isEnabled,
    pollingIntervalMinutes: c.pollingIntervalMinutes ? String(c.pollingIntervalMinutes) : '',
    webhookPath: c.webhookPath ?? '',
    // Secret-shaped fields come back masked (redactConnectorConfig) — leave
    // the input empty rather than resubmitting the mask literally; the
    // backend merges, so an empty/omitted field here keeps the real stored
    // value untouched.
    webhookUrl: config.webhookUrl === MASKED ? '' : ((config.webhookUrl as string) ?? ''),
    seamlessApiBaseUrl: (seamlessHR.apiBaseUrl as string) ?? '',
    seamlessApiKey: seamlessHR.apiKey === MASKED ? '' : ((seamlessHR.apiKey as string) ?? ''),
    fixtureEndpoint: (config.fixtureEndpoint as string) ?? '',
  };
}

function buildConfig(form: FormState): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  if (form.connectorType === 'TEAMS_WEBHOOK') {
    if (form.webhookUrl.trim()) config.webhookUrl = form.webhookUrl.trim();
  } else if (form.connectorType === 'SEAMLESSHR') {
    const seamlessHR: Record<string, unknown> = {};
    if (form.seamlessApiBaseUrl.trim()) seamlessHR.apiBaseUrl = form.seamlessApiBaseUrl.trim();
    if (form.seamlessApiKey.trim()) seamlessHR.apiKey = form.seamlessApiKey.trim();
    if (Object.keys(seamlessHR).length > 0) config.seamlessHR = seamlessHR;
  } else if (form.fixtureEndpoint.trim()) {
    config.fixtureEndpoint = form.fixtureEndpoint.trim();
  }
  return config;
}

export function ConnectorFormDialog({
  target,
  open,
  onOpenChange,
}: {
  target: 'create' | ConnectorDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = target !== 'create' && target !== null;
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    if (target === 'create') setForm(emptyForm());
    else if (target) setForm(fromConnector(target));
  }, [target]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: CreateConnectorBody = {
        name: form.name.trim(),
        connectorType: form.connectorType,
        syncDirection: form.syncDirection,
        isEnabled: form.isEnabled,
        pollingIntervalMinutes: form.pollingIntervalMinutes ? Number(form.pollingIntervalMinutes) : undefined,
        webhookPath: form.webhookPath.trim() || undefined,
        config: buildConfig(form),
      };
      return isEdit
        ? apiFetch<ConnectorDto>(`/api/admin/integrations/connectors/${(target as ConnectorDto).id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : apiFetch<ConnectorDto>('/api/admin/integrations/connectors', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Connector saved' : 'Connector created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'integrations', 'connectors'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save connector'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    saveMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit connector' : 'New connector'}</DialogTitle>
          <DialogDescription>Secret fields (webhook URLs, API keys) are never shown again after saving — leave them blank to keep the current value.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="connector-name">Name</Label>
            <Input id="connector-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.connectorType} onValueChange={(v) => setForm((f) => ({ ...f, connectorType: v as ConnectorType }))} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONNECTOR_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sync direction</Label>
              <Select value={form.syncDirection} onValueChange={(v) => setForm((f) => ({ ...f, syncDirection: v as SyncDirection }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYNC_DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.connectorType === 'TEAMS_WEBHOOK' ? (
            <div className="space-y-1.5">
              <Label htmlFor="connector-webhook-url">Teams Incoming Webhook URL</Label>
              <Input
                id="connector-webhook-url"
                value={form.webhookUrl}
                onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                placeholder={isEdit ? 'Unchanged — enter a new URL to replace' : 'https://…webhook.office.com/webhookb2/…'}
              />
            </div>
          ) : null}

          {form.connectorType === 'SEAMLESSHR' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="connector-seamless-url">SeamlessHR API base URL</Label>
                <Input id="connector-seamless-url" value={form.seamlessApiBaseUrl} onChange={(e) => setForm((f) => ({ ...f, seamlessApiBaseUrl: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connector-seamless-key">SeamlessHR API key</Label>
                <Input
                  id="connector-seamless-key"
                  type="password"
                  value={form.seamlessApiKey}
                  onChange={(e) => setForm((f) => ({ ...f, seamlessApiKey: e.target.value }))}
                  placeholder={isEdit ? 'Unchanged — enter a new key to replace' : ''}
                />
              </div>
            </>
          ) : null}

          {form.connectorType !== 'TEAMS_WEBHOOK' && form.connectorType !== 'SEAMLESSHR' ? (
            <div className="space-y-1.5">
              <Label htmlFor="connector-fixture">Fixture endpoint</Label>
              <Input id="connector-fixture" value={form.fixtureEndpoint} onChange={(e) => setForm((f) => ({ ...f, fixtureEndpoint: e.target.value }))} />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="connector-polling">Polling interval (minutes, optional)</Label>
            <Input
              id="connector-polling"
              type="number"
              min={1}
              value={form.pollingIntervalMinutes}
              onChange={(e) => setForm((f) => ({ ...f, pollingIntervalMinutes: e.target.value }))}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={form.isEnabled} onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))} />
            Enabled
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || !form.name.trim()}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

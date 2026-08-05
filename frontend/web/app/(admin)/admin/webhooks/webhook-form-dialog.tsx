'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
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
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type {
  CreateWebhookSubscriptionBody,
  UpdateWebhookSubscriptionBody,
  WebhookSubscriptionCreatedDto,
  WebhookSubscriptionDto,
} from '../_lib/types';

// Hand-mirrored from packages/db/prisma/schema.prisma's WebhookEventType enum
// — same "keep in sync manually" convention as admin/audit-log/page.tsx's
// local AUDIT_ACTIONS.
const WEBHOOK_EVENT_TYPES = [
  'ACCOUNT_CREATED',
  'ACCOUNT_UPDATED',
  'OPPORTUNITY_STAGE_CHANGED',
  'POLICY_BOUND',
  'POLICY_CANCELLED',
  'POLICY_RENEWED',
  'PREMIUM_OVERDUE',
  'DOCUMENT_UPLOADED',
  'TASK_COMPLETED',
  'APPROVAL_DECIDED',
  'CLAIM_STATUS_CHANGED',
  'CASE_STATUS_CHANGED',
] as const;

/**
 * Create and edit both live here (same shape as ip-whitelist-form-dialog.tsx's
 * `target: 'create' | Dto` contract) — but unlike that dialog, a successful
 * create response carries a `signingSecret` that (like the SCIM token) is
 * never retrievable again afterward, so this dialog has a second "secret
 * shown once" phase create transitions into. Edit never sees a secret at
 * all — PATCH's response omits it, matching webhook-subscriptions.controller.ts.
 */
export function WebhookFormDialog({
  target,
  open,
  onOpenChange,
}: {
  target: 'create' | WebhookSubscriptionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = target !== 'create';

  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [created, setCreated] = useState<WebhookSubscriptionCreatedDto | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isEdit) {
      setName(target.name);
      setTargetUrl(target.targetUrl);
      setEventTypes(target.eventTypes);
      setIsActive(target.isActive);
    } else {
      setName('');
      setTargetUrl('');
      setEventTypes([]);
      setIsActive(true);
    }
  }, [target, isEdit]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'webhook-subscriptions'] });
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateWebhookSubscriptionBody) =>
      apiFetch<WebhookSubscriptionCreatedDto>('/api/admin/webhook-subscriptions', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (sub) => {
      setCreated(sub);
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create subscription'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateWebhookSubscriptionBody) =>
      apiFetch<WebhookSubscriptionDto>(`/api/admin/webhook-subscriptions/${isEdit ? target.id : ''}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Subscription updated');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update subscription'),
  });

  function toggleEventType(type: string) {
    setEventTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isEdit) {
      // isActive only exists on update — creation is always active (see CreateWebhookSubscriptionDto).
      updateMutation.mutate({ name, targetUrl, eventTypes: eventTypes as UpdateWebhookSubscriptionBody['eventTypes'], isActive });
    } else {
      createMutation.mutate({ name, targetUrl, eventTypes: eventTypes as CreateWebhookSubscriptionBody['eventTypes'] });
    }
  }

  async function handleCopy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.signingSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setCreated(null);
      setCopied(false);
    }
    onOpenChange(nextOpen);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Subscription created</DialogTitle>
              <DialogDescription>
                Copy this signing secret now — it won&apos;t be shown again. Use it to verify the HMAC-SHA256
                signature on each inbound delivery.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="webhook-secret-value">Signing secret</Label>
              <div className="flex gap-2">
                <Input id="webhook-secret-value" readOnly value={created.signingSecret} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" aria-label="Copy signing secret" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{isEdit ? `Edit ${target.name}` : 'New webhook subscription'}</DialogTitle>
              <DialogDescription>
                Deliveries are dispatched asynchronously by the worker as matching events occur — see
                dispatch.job.ts.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="webhook-name">Name</Label>
                <Input id="webhook-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="webhook-url">Target URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://example.com/webhooks/topiadesk"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Event types</Label>
                <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-input p-3 sm:grid-cols-2">
                  {WEBHOOK_EVENT_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={eventTypes.includes(type)}
                        onChange={() => toggleEventType(type)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
                {eventTypes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Select at least one event type.</p>
                ) : null}
              </div>
              {isEdit ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Active
                </label>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending || !name.trim() || !targetUrl.trim() || eventTypes.length === 0}>
                  {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create subscription'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

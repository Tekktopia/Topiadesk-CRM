'use client';

import { useState, type FormEvent } from 'react';
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
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { OrgSettingDto, SetOrgSettingBody } from '../_lib/types';

/** Generic JSON editor for any org_settings key/value pair not covered by
 * a dedicated editor — used both to create a brand-new key and to edit an
 * existing "other" setting. Kept generic on purpose: the backend
 * deliberately does not enumerate which keys exist (see
 * OrgSettingsController's header comment). */
export function GenericSettingDialog({
  target,
  open,
  onOpenChange,
}: {
  target: 'create' | OrgSettingDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = target !== 'create';

  const [key, setKey] = useState(isEdit ? target.key : '');
  const [valueText, setValueText] = useState(isEdit ? JSON.stringify(target.value, null, 2) : '');
  const [parseError, setParseError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(valueText);
      } catch {
        throw new Error('Value must be valid JSON (e.g. "a string", 42, [1,2,3], {"a":1}, true)');
      }
      const body: SetOrgSettingBody = { value: parsed };
      return apiFetch<OrgSettingDto>(`/api/admin/org-settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success('Setting saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'org-settings'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to save setting'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setParseError(null);
    try {
      JSON.parse(valueText);
    } catch {
      setParseError('Not valid JSON');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${target.key}` : 'Add org setting'}</DialogTitle>
          <DialogDescription>
            Value must be valid JSON — a string, number, boolean, array, or object.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="setting-key">Key</Label>
            <Input
              id="setting-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isEdit}
              placeholder="e.g. notifications.digest_hour_local"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setting-value">Value (JSON)</Label>
            <textarea
              id="setting-value"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              rows={5}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-brand-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              required
            />
            {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !key.trim() || !valueText.trim()}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

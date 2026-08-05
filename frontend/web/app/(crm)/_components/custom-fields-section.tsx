'use client';

import * as React from 'react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@topiadesk/ui';
import { useCustomFieldDefinitions, useDirectoryUsers } from '../_lib/hooks';
import type { CustomFieldDefinition, CustomFieldEntityType } from '../_lib/types';

export type CustomFieldValues = Record<string, unknown>;

/**
 * Required-field validation — mirrors custom-fields.validator.ts's isRequired
 * check, which the backend (validateCustomFields) only enforces on create,
 * never on an update that happens to touch customFields. Returns the first
 * missing field's message, or null if everything required is present.
 */
export function validateCustomFieldValues(
  definitions: CustomFieldDefinition[] | undefined,
  values: CustomFieldValues,
  isCreate: boolean,
): string | null {
  if (!definitions || !isCreate) return null;
  for (const def of definitions) {
    if (!def.isActive || !def.isRequired) continue;
    const value = values[def.key];
    if (value === undefined || value === null || value === '') {
      return `"${def.label}" is required`;
    }
  }
  return null;
}

/**
 * Renders one input per active CustomFieldDefinition for `entityType`, below
 * an entity's standard fields — used by Account/Contact/Lead/Opportunity's
 * create/edit form dialogs. `customFields` is a jsonb column (schema.prisma's
 * Phase 2 — CRM enhancements section), so the field set is dynamic
 * (admin-managed CustomFieldDefinition rows, not known at compile time) —
 * values live in `values`/`onChange` here, outside the parent form's
 * react-hook-form/zod schema, and the caller merges them into the
 * create/update payload's `customFields` key at submit time.
 *
 * PATCH semantics matter here: custom-fields.validator.ts (called from
 * PATCH handlers) replaces the WHOLE customFields object when the key is
 * present in the body, it does not merge per-key — so callers must always
 * seed `values` from the entity's full existing `customFields` object, never
 * build it up from scratch, or an edit will silently wipe out any custom
 * field values this render doesn't touch (e.g. values left under a since-
 * deactivated definition).
 */
export function CustomFieldsSection({
  entityType,
  values,
  onChange,
}: {
  entityType: CustomFieldEntityType;
  values: CustomFieldValues;
  onChange: (next: CustomFieldValues) => void;
}) {
  const { data: definitions, isLoading } = useCustomFieldDefinitions(entityType);
  const { usersById } = useDirectoryUsers();

  const active = (definitions ?? []).filter((d) => d.isActive).sort((a, b) => a.displayOrder - b.displayOrder);

  function setValue(key: string, value: unknown) {
    onChange({ ...values, [key]: value });
  }

  if (isLoading) {
    return (
      <div className="space-y-2 border-t border-border pt-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (active.length === 0) return null;

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Custom fields</p>
      {active.map((def) => (
        <CustomFieldInput key={def.id} definition={def} value={values[def.key]} onChange={(v) => setValue(def.key, v)} usersById={usersById} />
      ))}
    </div>
  );
}

function CustomFieldInput({
  definition,
  value,
  onChange,
  usersById,
}: {
  definition: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  usersById: Map<string, { id: string; fullName: string }>;
}) {
  const label = (
    <label className="text-xs font-medium text-muted-foreground">
      {definition.label}
      {definition.isRequired ? <span className="text-destructive"> *</span> : null}
    </label>
  );

  switch (definition.fieldType) {
    case 'TEXT':
    case 'URL':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type={definition.fieldType === 'URL' ? 'url' : 'text'}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {definition.helpText ? <p className="text-xs text-muted-foreground">{definition.helpText}</p> : null}
        </div>
      );
    case 'TEXTAREA':
      return (
        <div className="space-y-1.5">
          {label}
          <textarea
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {definition.helpText ? <p className="text-xs text-muted-foreground">{definition.helpText}</p> : null}
        </div>
      );
    case 'NUMBER':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="number"
            step="1"
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number.parseInt(e.target.value, 10))}
          />
        </div>
      );
    case 'DECIMAL':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="number"
            step="any"
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number.parseFloat(e.target.value))}
          />
        </div>
      );
    case 'DATE':
      return (
        <div className="space-y-1.5">
          {label}
          <Input type="date" value={typeof value === 'string' ? value.slice(0, 10) : ''} onChange={(e) => onChange(e.target.value || undefined)} />
        </div>
      );
    case 'BOOLEAN':
      return (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          {definition.label}
        </label>
      );
    case 'SELECT': {
      const options = Array.isArray(definition.options) ? definition.options : [];
      return (
        <div className="space-y-1.5">
          {label}
          <Select value={typeof value === 'string' ? value : '__unset'} onValueChange={(v) => onChange(v === '__unset' ? undefined : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset">Not set</SelectItem>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    case 'MULTI_SELECT': {
      const options = Array.isArray(definition.options) ? definition.options : [];
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5">
          {label}
          <div className="flex flex-wrap gap-3">
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={selected.includes(opt)}
                  onChange={(e) => onChange(e.target.checked ? [...selected, opt] : selected.filter((o) => o !== opt))}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    }
    case 'USER_REFERENCE': {
      const users = Array.from(usersById.values());
      return (
        <div className="space-y-1.5">
          {label}
          <Select value={typeof value === 'string' ? value : '__unset'} onValueChange={(v) => onChange(v === '__unset' ? undefined : v)}>
            <SelectTrigger>
              <SelectValue placeholder={users.length === 0 ? 'No directory available' : 'Select user'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset">Not set</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    default:
      return null;
  }
}

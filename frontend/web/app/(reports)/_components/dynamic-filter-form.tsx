'use client';

import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@topiadesk/ui';
import type { FilterFieldDescriptor } from '../_lib/filter-schema';

/** Radix Select can't carry an empty-string item value, so "no selection"
 * (an optional filter left blank) needs its own sentinel — translated back
 * to "" before it ever reaches the values map. */
const ANY_VALUE = '__any__';

const BOOLEAN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

/**
 * Renders one input per field in `fields` — generated entirely from a
 * report's own `filterSchema` (see _lib/filter-schema.ts's header comment
 * for why this is the only place field names/types come from). There is no
 * free-text/raw-JSON field anywhere in this form: every kind maps to a
 * plain, constrained HTML input (text/date/number) or a closed Select
 * (enum/boolean), so a caller can never submit a filter key the backend
 * didn't declare.
 */
export function DynamicFilterForm({
  fields,
  values,
  onChange,
  idPrefix = 'filter-',
}: {
  fields: FilterFieldDescriptor[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  idPrefix?: string;
}) {
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">This report has no filters — it runs against the full scoped dataset.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const id = `${idPrefix}${field.key}`;
        const value = values[field.key] ?? '';
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={id}>
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {renderField(field, id, value, (next) => onChange(field.key, next))}
          </div>
        );
      })}
    </div>
  );
}

function renderField(field: FilterFieldDescriptor, id: string, value: string, onChange: (value: string) => void) {
  switch (field.kind) {
    case 'enum':
    case 'boolean': {
      const options = field.kind === 'boolean' ? BOOLEAN_OPTIONS : (field.options ?? []).map((o) => ({ value: o, label: o }));
      return (
        <Select value={value || ANY_VALUE} onValueChange={(next) => onChange(next === ANY_VALUE ? '' : next)}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>Any</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case 'date':
      return <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} required={field.required} />;
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          min={field.min}
          max={field.max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    case 'uuid':
      return (
        <Input
          id={id}
          type="text"
          placeholder="UUID"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    case 'text':
    default:
      return <Input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} required={field.required} />;
  }
}

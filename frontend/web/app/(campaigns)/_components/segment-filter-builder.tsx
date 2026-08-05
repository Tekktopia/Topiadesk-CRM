'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@topiadesk/ui';
import { OPERATOR_LABELS, SEGMENT_FIELDS, SEGMENT_FIELDS_BY_KEY, type SegmentFieldOption } from '../_lib/segment-fields';
import type { SegmentFilterCondition, SegmentFilterGroup } from '../_lib/types';

function defaultConditionForField(field: string): SegmentFilterCondition {
  const spec = SEGMENT_FIELDS_BY_KEY.get(field);
  return { field, operator: spec?.operators[0] ?? 'eq', value: '' };
}

/**
 * Structured field/operator/value criteria builder for AudienceSegment.filters
 * — the simplest reasonable UI given the backend's fixed, typed field
 * allowlist (segment-fields.ts), not a raw JSON textarea and not a
 * general-purpose query-builder library. No filter-builder precedent exists
 * elsewhere in app/(crm)/** to mirror, so this is new.
 */
export function SegmentFilterBuilder({
  value,
  onChange,
}: {
  value: SegmentFilterGroup;
  onChange: (next: SegmentFilterGroup) => void;
}) {
  const conditions = value.conditions;

  function updateCondition(index: number, patch: Partial<SegmentFilterCondition>) {
    onChange({ ...value, conditions: conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  }

  function addCondition() {
    const first = SEGMENT_FIELDS[0]!;
    onChange({ ...value, conditions: [...conditions, defaultConditionForField(first.field)] });
  }

  function removeCondition(index: number) {
    onChange({ ...value, conditions: conditions.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Match</span>
        <Select value={value.match} onValueChange={(match) => onChange({ ...value, match: match as 'ALL' | 'ANY' })}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All conditions (AND)</SelectItem>
            <SelectItem value="ANY">Any condition (OR)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {conditions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No conditions yet — this segment matches every contact.</p>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition, index) => {
            const spec = SEGMENT_FIELDS_BY_KEY.get(condition.field);
            return (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center"
              >
                <Select value={condition.field} onValueChange={(field) => updateCondition(index, defaultConditionForField(field))}>
                  <SelectTrigger className="sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEGMENT_FIELDS.map((f) => (
                      <SelectItem key={f.field} value={f.field}>
                        {f.entityLabel}: {f.fieldLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={condition.operator} onValueChange={(operator) => updateCondition(index, { operator, value: '' })}>
                  <SelectTrigger className="sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(spec?.operators ?? []).map((op) => (
                      <SelectItem key={op} value={op}>
                        {OPERATOR_LABELS[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <ConditionValueInput
                  key={`${condition.field}:${condition.operator}`}
                  spec={spec}
                  condition={condition}
                  onChange={(v) => updateCondition(index, { value: v })}
                />

                <Button type="button" variant="ghost" size="icon" aria-label="Remove condition" onClick={() => removeCondition(index)}>
                  <X aria-hidden />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addCondition}>
        <Plus aria-hidden /> Add condition
      </Button>
    </div>
  );
}

/** Keyed by field:operator in the parent so switching either resets this input's local state cleanly instead of carrying over a stale value shape (e.g. an array left over from a prior "in" operator). */
function ConditionValueInput({
  spec,
  condition,
  onChange,
}: {
  spec: SegmentFieldOption | undefined;
  condition: SegmentFilterCondition;
  onChange: (value: unknown) => void;
}) {
  const isListOperator = condition.operator === 'in' || condition.operator === 'notIn';
  const [listText, setListText] = React.useState(() => (Array.isArray(condition.value) ? condition.value.join(', ') : ''));

  if (isListOperator) {
    return (
      <Input
        className="flex-1"
        placeholder="Comma-separated values"
        value={listText}
        onChange={(e) => {
          setListText(e.target.value);
          onChange(
            e.target.value
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
          );
        }}
      />
    );
  }

  if (spec?.type === 'enum') {
    return (
      <Select value={typeof condition.value === 'string' ? condition.value : ''} onValueChange={onChange}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Select a value" />
        </SelectTrigger>
        <SelectContent>
          {(spec.enumValues ?? []).map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (spec?.type === 'date') {
    return (
      <Input
        type="date"
        className="flex-1"
        value={typeof condition.value === 'string' ? condition.value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (spec?.type === 'number') {
    return (
      <Input
        type="number"
        className="flex-1"
        value={typeof condition.value === 'number' || typeof condition.value === 'string' ? condition.value : ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    );
  }

  return (
    <Input
      className="flex-1"
      value={typeof condition.value === 'string' ? condition.value : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

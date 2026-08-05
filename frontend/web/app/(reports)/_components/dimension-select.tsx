'use client';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@topiadesk/ui';
import type { ReportDimension } from '../_lib/types';

/** Sentinel for "no pivot — finest-grain rows" — never sent to the backend
 * as-is, translated to `undefined` before the request body is built. Kept
 * distinct from DynamicFilterForm's ANY_VALUE only so the two modules stay
 * independently readable; the value itself has no special meaning. */
export const NO_DIMENSION = '__none__';

/**
 * Dimension picker constrained to the report's own `allowedDimensions` —
 * the security boundary reports.controller.ts's `assertValidDimension`
 * enforces server-side (see reports.controller.ts's header comment on
 * `dimension`). This component never accepts free text; it only ever
 * renders `SelectItem`s sourced from `dimensions`, so there is no path for
 * an arbitrary string to reach the `dimension` field of a run/schedule
 * request from this control.
 */
export function DimensionSelect({
  dimensions,
  value,
  onChange,
  id = 'dimension',
}: {
  dimensions: ReportDimension[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Group by</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_DIMENSION}>No grouping (finest detail)</SelectItem>
          {dimensions.map((d) => (
            <SelectItem key={d.key} value={d.key}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

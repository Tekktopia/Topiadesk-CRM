'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@topiadesk/ui';
import { useCarriers } from '../_lib/hooks';

/** Carrier picker — the seeded carrier panel (AIICO Insurance, Continental Reinsurance, ...) is small, so a plain Select (no search) is sufficient. */
export function CarrierSelect({
  value,
  onChange,
  placeholder = 'Select a carrier',
  disabled,
}: {
  value?: string;
  onChange: (carrierId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { data, isLoading } = useCarriers();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || isLoading}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? 'Loading carriers…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(data ?? []).map((carrier) => (
          <SelectItem key={carrier.id} value={carrier.id}>
            {carrier.name} ({carrier.carrierType})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

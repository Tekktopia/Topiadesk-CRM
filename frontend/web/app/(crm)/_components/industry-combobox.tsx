'use client';

import * as React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Input } from '@topiadesk/ui';
import { useIndustries } from '../_lib/hooks';
import { useDebouncedValue } from '../_lib/use-debounced-value';

export interface IndustryRef {
  id: string;
  name: string;
}

/**
 * Searchable industry picker backed by GET /crm/industries?search= — same
 * self-contained shape as account-combobox.tsx (no Radix combobox
 * primitive in @topiadesk/ui). Replaces the raw-UUID text input the
 * Account form used to fall back to before this endpoint existed.
 */
export function IndustryCombobox({
  value,
  onChange,
  placeholder = 'Search industries…',
  disabled,
}: {
  value: IndustryRef | null;
  onChange: (industry: IndustryRef | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const { data, isFetching } = useIndustries(debouncedSearch || undefined);

  return (
    <div className="relative">
      <Input
        value={open ? search : (value?.name ?? '')}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setSearch('');
        }}
        onChange={(event) => setSearch(event.target.value)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {open ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-brand-md">
          {isFetching ? (
            <div className="flex items-center justify-center p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : (data ?? []).length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No industries found.</p>
          ) : (
            (data ?? []).map((industry) => (
              <button
                key={industry.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ id: industry.id, name: industry.name });
                  setOpen(false);
                }}
              >
                {industry.name}
                {value?.id === industry.id ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
              </button>
            ))
          )}
          {value ? (
            <button
              type="button"
              className="mt-1 flex w-full items-center rounded-sm border-t border-border px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear selection
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

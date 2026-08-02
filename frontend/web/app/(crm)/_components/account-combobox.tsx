'use client';

import * as React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn, Input } from '@topiadesk/ui';
import { useAccounts } from '../_lib/hooks';
import { useDebouncedValue } from '../_lib/use-debounced-value';

export interface AccountRef {
  id: string;
  name: string;
}

/**
 * Searchable account picker backed by `GET /crm/accounts?q=` (via
 * useAccounts). No Radix combobox primitive exists in @topiadesk/ui, so
 * this is a small self-contained input + result list — used by the
 * Opportunity form and the Lead conversion dialog's "link to existing
 * account" path.
 */
export function AccountCombobox({
  value,
  onChange,
  placeholder = 'Search accounts…',
  disabled,
}: {
  value: AccountRef | null;
  onChange: (account: AccountRef | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const { data, isFetching } = useAccounts({ q: debouncedSearch || undefined, take: 8 });

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
            <p className="p-3 text-sm text-muted-foreground">No accounts found.</p>
          ) : (
            (data ?? []).map((account) => (
              <button
                key={account.id}
                type="button"
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-secondary hover:text-secondary-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange({ id: account.id, name: account.name });
                  setOpen(false);
                }}
              >
                <span>{account.name}</span>
                {value?.id === account.id ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
      <p className={cn('mt-1 text-xs text-muted-foreground', !open && 'sr-only')}>
        Type to search by account name.
      </p>
    </div>
  );
}

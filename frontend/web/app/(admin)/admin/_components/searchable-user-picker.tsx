'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, User, X } from 'lucide-react';
import { Badge, Button, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@topiadesk/ui';

interface UserLike {
  id: string;
  fullName: string;
}

/**
 * Replaces a plain scrolling `<Select>` for person pickers — the customer's
 * own complaint was "the list is too much, we should be able to search."
 * Built on the existing cmdk-based Command primitives (packages/ui/src/
 * primitives/command.tsx), the same ones already powering the app's own
 * ⌘K command palette (frontend/web/app/command-palette.tsx) — no new
 * dependency, no new Popover primitive, just a button that opens the same
 * kind of searchable dialog.
 */
export function SearchableUserPicker({
  users,
  value,
  onChange,
  placeholder = 'Choose a person',
}: {
  users: UserLike[];
  value: string | undefined;
  onChange: (userId: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => users.find((u) => u.id === value), [users, value]);

  return (
    <>
      <Button type="button" variant="outline" className="w-full justify-between font-normal" onClick={() => setOpen(true)}>
        <span className="flex min-w-0 items-center gap-2">
          <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{selected?.fullName ?? placeholder}</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search people…" />
        <CommandList>
          <CommandEmpty>No one matches.</CommandEmpty>
          <CommandGroup>
            {users.map((u) => (
              <CommandItem
                key={u.id}
                value={u.fullName}
                onSelect={() => {
                  onChange(u.id);
                  setOpen(false);
                }}
              >
                <Check className={`h-4 w-4 shrink-0 ${u.id === value ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
                {u.fullName}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

/** Multi-select variant — used for APPROVAL_GATE's named individual
 * approvers. Selected people render as removable chips below the trigger;
 * the dialog stays open across selections so multiple people can be added
 * in one pass. */
export function SearchableUserMultiPicker({
  users,
  value,
  onChange,
  placeholder = 'Add approvers',
}: {
  users: UserLike[];
  value: string[];
  onChange: (userIds: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => users.filter((u) => value.includes(u.id)), [users, value]);

  function toggle(userId: string) {
    onChange(value.includes(userId) ? value.filter((id) => id !== userId) : [...value, userId]);
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full justify-between font-normal" onClick={() => setOpen(true)}>
        <span className="flex min-w-0 items-center gap-2">
          <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{selected.length > 0 ? `${selected.length} selected` : placeholder}</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Button>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <Badge key={u.id} variant="secondary" className="gap-1 pr-1">
              {u.fullName}
              <button
                type="button"
                onClick={() => toggle(u.id)}
                className="rounded-none p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remove ${u.fullName}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search people…" />
        <CommandList>
          <CommandEmpty>No one matches.</CommandEmpty>
          <CommandGroup>
            {users.map((u) => (
              <CommandItem key={u.id} value={u.fullName} onSelect={() => toggle(u.id)}>
                <Check className={`h-4 w-4 shrink-0 ${value.includes(u.id) ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
                {u.fullName}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

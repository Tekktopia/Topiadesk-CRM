'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@topiadesk/ui';

const OPEN_EVENT = 'topiadesk:open-keyboard-shortcuts';

/** Called by the account menu's "Keyboard shortcuts" item (rendered twice —
 * header chip and sidebar icon — via account-menu.tsx) to open the single
 * shared dialog below, without lifting state or adding a context provider. */
export function openKeyboardShortcuts(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ['⌘', 'K'], description: 'Open search' },
  { keys: ['?'], description: 'Show this list' },
];

/** Rendered once, in AppHeader next to CommandPalette. Owns the actual "?"
 * key listener so it only ever fires once regardless of how many
 * AccountMenu instances are mounted. */
export function KeyboardShortcutsDialog() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onOpenEvent() {
      setOpen(true);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Available anywhere in TopiaDesk.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-1">
          {SHORTCUTS.map((s) => (
            <div key={s.description} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{s.description}</span>
              <span className="flex gap-1">
                {s.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

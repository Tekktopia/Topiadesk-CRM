'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Badge, Input } from '@topiadesk/ui';

/**
 * Free-form chip input for Account.tags — no shared Tag registry exists
 * (see schema.prisma's comment on Account.tags), so this is plain text
 * entry, not an autocomplete against existing tags. Enter or comma commits
 * the current text as a chip; Backspace on an empty input removes the last
 * chip (standard tag-input affordance).
 */
export function TagInput({ value, onChange, placeholder = 'Add a tag…' }: { value: string[]; onChange: (tags: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = React.useState('');

  function commit(raw: string) {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 shadow-brand-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 font-normal">
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            className="rounded-full hover:bg-foreground/10"
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </Badge>
      ))}
      <Input
        value={draft}
        placeholder={value.length === 0 ? placeholder : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(draft);
            setDraft('');
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft) {
            commit(draft);
            setDraft('');
          }
        }}
        className="h-6 w-auto min-w-[8ch] flex-1 border-0 p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}

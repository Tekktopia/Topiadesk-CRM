'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { CASE_MANAGEMENT_ENTITY_TYPES, humanize } from '../../_lib/constants';
import { useCreateMacro, useUpdateMacro } from '../../_lib/hooks';
import type { CaseManagementEntityType, Macro } from '../../_lib/types';
import { actionSpecsToDraftActions, blankDraftAction, draftActionsToActionSpecs, MacroActionsBuilder, type DraftAction } from './macro-actions-builder';

const UNSET = '__both';

export function MacroFormDialog({
  open,
  onOpenChange,
  macro,
  existingCategories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  macro?: Macro;
  /** Distinct, non-empty `category` values already in use — offered as a `<datalist>` on the category input so authors reuse an existing grouping instead of accidentally forking a near-duplicate ("Renewals" vs "renewal"). Freeform text either way — see macros-list-view.tsx's groupMacrosByCategory. */
  existingCategories: string[];
}) {
  const isEdit = Boolean(macro);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [entityType, setEntityType] = React.useState<CaseManagementEntityType | ''>('');
  const [isActive, setIsActive] = React.useState(true);
  const [actions, setActions] = React.useState<DraftAction[]>([blankDraftAction()]);

  React.useEffect(() => {
    if (!open) return;
    if (macro) {
      setName(macro.name);
      setDescription(macro.description ?? '');
      setCategory(macro.category ?? '');
      setEntityType(macro.entityType ?? '');
      setIsActive(macro.isActive);
      setActions(macro.actions.length > 0 ? actionSpecsToDraftActions(macro.actions) : [blankDraftAction()]);
    } else {
      setName('');
      setDescription('');
      setCategory('');
      setEntityType('');
      setIsActive(true);
      setActions([blankDraftAction()]);
    }
  }, [open, macro]);

  const createMacro = useCreateMacro();
  const updateMacro = useUpdateMacro(macro?.id ?? '');
  const isPending = createMacro.isPending || updateMacro.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      description: description || undefined,
      category: category.trim() || undefined,
      entityType: entityType || undefined,
      actions: draftActionsToActionSpecs(actions),
      isActive,
    };
    if (isEdit && macro) {
      await updateMacro.mutateAsync(payload);
    } else {
      await createMacro.mutateAsync(payload);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit macro' : 'New macro'}</DialogTitle>
          <DialogDescription>
            A macro is a bundle of actions an agent applies to a claim or case in one click — see the &quot;Apply macro&quot; button on a
            case&apos;s detail page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="macro-name">Name</Label>
            <Input id="macro-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Escalate to manager" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="macro-description">Description</Label>
            <Input id="macro-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — shown in the macro list" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="macro-category">Category</Label>
            <Input
              id="macro-category"
              list="macro-category-options"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Optional — groups this macro in the macro list, e.g. Renewals"
            />
            <datalist id="macro-category-options">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select value={entityType || UNSET} onValueChange={(v) => setEntityType(v === UNSET ? '' : (v as CaseManagementEntityType))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Claim & Case</SelectItem>
                  {CASE_MANAGEMENT_ENTITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {humanize(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Actions</Label>
            <MacroActionsBuilder entityType={entityType} actions={actions} onChange={setActions} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name || actions.length === 0}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create macro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

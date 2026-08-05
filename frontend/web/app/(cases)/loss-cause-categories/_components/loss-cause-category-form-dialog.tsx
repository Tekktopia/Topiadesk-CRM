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
import { buildCategoryTree, categoryLabel, descendantsOf } from '../../_lib/category-tree';
import { useCreateLossCauseCategory, useUpdateLossCauseCategory } from '../../_lib/hooks';
import type { LossCauseCategory } from '../../_lib/types';

const NO_PARENT = '__none';

/** Create/edit dialog for a loss cause category — mirrors macros/_components/macro-form-dialog.tsx's plain useState shape (the whole row is passed in, not re-fetched by id). */
export function LossCauseCategoryFormDialog({
  open,
  onOpenChange,
  category,
  allCategories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: LossCauseCategory;
  /** Full flat category list, for the parent picker — see _lib/category-tree.ts. */
  allCategories: LossCauseCategory[];
}) {
  const isEdit = Boolean(category);
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [parentId, setParentId] = React.useState<string>(NO_PARENT);

  React.useEffect(() => {
    if (!open) return;
    if (category) {
      setName(category.name);
      setCode(category.code);
      setParentId(category.parentId ?? NO_PARENT);
    } else {
      setName('');
      setCode('');
      setParentId(NO_PARENT);
    }
  }, [open, category]);

  const createCategory = useCreateLossCauseCategory();
  const updateCategory = useUpdateLossCauseCategory(category?.id ?? '');
  const isPending = createCategory.isPending || updateCategory.isPending;

  // See case-category-form-dialog.tsx's identical comment — excludes the
  // category itself and its own descendants to prevent a cycle.
  const descendantIds = isEdit && category ? descendantsOf(category.id, allCategories) : new Set<string>();
  const selectableParents = allCategories.filter((c) => c.id !== category?.id && !descendantIds.has(c.id));
  const parentRows = buildCategoryTree(selectableParents);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name, code, parentId: parentId === NO_PARENT ? null : parentId };
    if (isEdit && category) {
      await updateCategory.mutateAsync(payload);
    } else {
      await createCategory.mutateAsync(payload);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit loss cause category' : 'New loss cause category'}</DialogTitle>
          <DialogDescription>
            Categorizes a claim&apos;s cause of loss (e.g. Fire, Flood, Theft) — selectable on the &quot;New claim&quot; dialog.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="loss-cause-name">Name</Label>
            <Input id="loss-cause-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Fire damage" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loss-cause-code">Code</Label>
            <Input id="loss-cause-code" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="e.g. FIRE" />
          </div>
          <div className="space-y-1.5">
            <Label>Parent category</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>None — top-level category</SelectItem>
                {parentRows.map((row) => (
                  <SelectItem key={row.category.id} value={row.category.id}>
                    {categoryLabel(row)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name || !code}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

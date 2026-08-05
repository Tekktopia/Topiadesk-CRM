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
import { CASE_TYPES, caseTypeLabel } from '../../_lib/constants';
import { useCreateCaseCategory, useUpdateCaseCategory } from '../../_lib/hooks';
import type { CaseCategory, CaseType } from '../../_lib/types';

const UNSET = '__any';
const NO_PARENT = '__none';

/** Create/edit dialog for a case category — mirrors macros/_components/macro-form-dialog.tsx's plain useState shape (the whole row is passed in, not re-fetched by id). */
export function CaseCategoryFormDialog({
  open,
  onOpenChange,
  category,
  allCategories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CaseCategory;
  /** Full flat category list, for the parent picker — see _lib/category-tree.ts. */
  allCategories: CaseCategory[];
}) {
  const isEdit = Boolean(category);
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [caseType, setCaseType] = React.useState<CaseType | ''>('');
  const [parentId, setParentId] = React.useState<string>(NO_PARENT);

  React.useEffect(() => {
    if (!open) return;
    if (category) {
      setName(category.name);
      setCode(category.code);
      setCaseType((category.caseType as CaseType | null) ?? '');
      setParentId(category.parentId ?? NO_PARENT);
    } else {
      setName('');
      setCode('');
      setCaseType('');
      setParentId(NO_PARENT);
    }
  }, [open, category]);

  const createCategory = useCreateCaseCategory();
  const updateCategory = useUpdateCaseCategory(category?.id ?? '');
  const isPending = createCategory.isPending || updateCategory.isPending;

  // A category can't be its own parent, and (to keep the client-side tree
  // walk in category-tree.ts simple, and to avoid a cycle) can't be
  // re-parented under its own descendant either.
  const descendantIds = isEdit && category ? descendantsOf(category.id, allCategories) : new Set<string>();
  const selectableParents = allCategories.filter((c) => c.id !== category?.id && !descendantIds.has(c.id));
  const parentRows = buildCategoryTree(selectableParents);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name, code, caseType: caseType || undefined, parentId: parentId === NO_PARENT ? null : parentId };
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
          <DialogTitle>{isEdit ? 'Edit case category' : 'New case category'}</DialogTitle>
          <DialogDescription>
            Categorizes an enquiry, service request, or complaint — selectable on the &quot;New case&quot; dialog.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="case-category-name">Name</Label>
            <Input id="case-category-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Billing enquiry" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="case-category-code">Code</Label>
            <Input id="case-category-code" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="e.g. BILLING" />
          </div>
          <div className="space-y-1.5">
            <Label>Restrict to ticket type</Label>
            <Select value={caseType || UNSET} onValueChange={(v) => setCaseType(v === UNSET ? '' : (v as CaseType))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any ticket type</SelectItem>
                {CASE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {caseTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

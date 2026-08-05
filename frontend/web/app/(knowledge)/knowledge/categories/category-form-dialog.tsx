'use client';

import { useEffect, useState, type FormEvent } from 'react';
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
import { buildCategoryTree, categoryLabel } from '../../_lib/category-tree';
import { useCreateKnowledgeCategory, useUpdateKnowledgeCategory } from '../../_lib/queries';
import type { KnowledgeCategory } from '../../_lib/types';

const NONE = '__none__';

export function CategoryFormDialog({
  target,
  allCategories,
  open,
  onOpenChange,
}: {
  target: 'create' | KnowledgeCategory;
  allCategories: KnowledgeCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = target !== 'create';

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState<string>(NONE);
  const [order, setOrder] = useState('0');

  useEffect(() => {
    if (isEdit) {
      setName(target.name);
      setCode(target.code);
      setParentCategoryId(target.parentCategoryId ?? NONE);
      setOrder(String(target.order));
    } else {
      setName('');
      setCode('');
      setParentCategoryId(NONE);
      setOrder('0');
    }
  }, [target, isEdit]);

  const createMutation = useCreateKnowledgeCategory();
  const updateMutation = useUpdateKnowledgeCategory();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // A category can't be its own parent, and (to keep the client-side tree
  // walk in category-tree.ts simple) can't be re-parented under its own
  // descendant either — both would introduce a cycle.
  const descendantIds = isEdit ? descendantsOf(target.id, allCategories) : new Set<string>();
  const selectableParents = allCategories.filter((c) => c.id !== (isEdit ? target.id : undefined) && !descendantIds.has(c.id));
  const parentRows = buildCategoryTree(selectableParents);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsedOrder = Number.parseInt(order, 10);
    const body = {
      name,
      code,
      parentCategoryId: parentCategoryId === NONE ? undefined : parentCategoryId,
      order: Number.isNaN(parsedOrder) ? undefined : parsedOrder,
    };
    if (isEdit) {
      updateMutation.mutate({ id: target.id, input: body }, { onSuccess: () => onOpenChange(false) });
    } else {
      createMutation.mutate(body, { onSuccess: () => onOpenChange(false) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${target.name}` : 'New category'}</DialogTitle>
          <DialogDescription>Organizes Knowledge Base articles. Nest by choosing a parent category.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={150} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-code">Code</Label>
              <Input id="cat-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required minLength={1} maxLength={50} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Parent category</Label>
            <Select value={parentCategoryId} onValueChange={setParentCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None — top-level category</SelectItem>
                {parentRows.map((row) => (
                  <SelectItem key={row.category.id} value={row.category.id}>
                    {categoryLabel(row)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-order">Sort order</Label>
            <Input id="cat-order" type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim() || !code.trim()}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function descendantsOf(id: string, all: KnowledgeCategory[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of all) {
    if (!c.parentCategoryId) continue;
    const siblings = children.get(c.parentCategoryId) ?? [];
    siblings.push(c.id);
    children.set(c.parentCategoryId, siblings);
  }
  const result = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || result.has(next)) continue;
    result.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return result;
}

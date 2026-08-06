'use client';

import * as React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import type { DocumentCategoryDto } from '@/app/(policy)/lib/types';

/** Category picker for the documents bulk-categorize action (POST /api/documents/bulk/categorize). */
export function CategorizeDialog({
  open,
  onOpenChange,
  categories,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: DocumentCategoryDto[];
  isPending: boolean;
  onConfirm: (categoryId: string) => void;
}) {
  const [categoryId, setCategoryId] = React.useState('');

  React.useEffect(() => {
    if (open) setCategoryId('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move to category</DialogTitle>
          <DialogDescription>Applies to every currently selected document.</DialogDescription>
        </DialogHeader>
        <Select value={categoryId || '__unset'} onValueChange={(v) => setCategoryId(v === '__unset' ? '' : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unset">Select a category</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(categoryId)} disabled={isPending || !categoryId}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

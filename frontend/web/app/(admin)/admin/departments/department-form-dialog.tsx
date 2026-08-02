'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { CreateDepartmentBody, DepartmentDto, UpdateDepartmentBody } from '../_lib/types';

const NONE = '__none__';

export function DepartmentFormDialog({
  target,
  allDepartments,
  open,
  onOpenChange,
}: {
  target: 'create' | DepartmentDto;
  allDepartments: DepartmentDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = target !== 'create';

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentDepartmentId, setParentDepartmentId] = useState<string>(NONE);

  useEffect(() => {
    if (isEdit) {
      setName(target.name);
      setCode(target.code);
      setParentDepartmentId(target.parentDepartmentId ?? NONE);
    } else {
      setName('');
      setCode('');
      setParentDepartmentId(NONE);
    }
  }, [target, isEdit]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateDepartmentBody) =>
      apiFetch<DepartmentDto>('/api/admin/departments', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Department created');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create department'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateDepartmentBody) =>
      apiFetch<DepartmentDto>(`/api/admin/departments/${isEdit ? target.id : ''}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Department updated');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update department'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parent = parentDepartmentId === NONE ? null : parentDepartmentId;
    if (isEdit) {
      updateMutation.mutate({ name, code, parentDepartmentId: parent });
    } else {
      createMutation.mutate({ name, code, parentDepartmentId: parent });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const otherDepartments = isEdit ? allDepartments.filter((d) => d.id !== target.id) : allDepartments;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${target.name}` : 'New department'}</DialogTitle>
          <DialogDescription>Reference data feeding department-scoped record visibility.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="dept-name">Name</Label>
            <Input id="dept-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={150} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-code">Code</Label>
            <Input id="dept-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required minLength={2} maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label>Parent department</Label>
            <Select value={parentDepartmentId} onValueChange={setParentDepartmentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {otherDepartments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim() || !code.trim()}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create department'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

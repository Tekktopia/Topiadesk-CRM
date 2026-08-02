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
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { CreateTeamBody, TeamDto, UpdateTeamBody } from '../_lib/types';

export function TeamFormDialog({
  target,
  open,
  onOpenChange,
}: {
  target: 'create' | TeamDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = target !== 'create';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isEdit) {
      setName(target.name);
      setDescription(target.description ?? '');
    } else {
      setName('');
      setDescription('');
    }
  }, [target, isEdit]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateTeamBody) => apiFetch<TeamDto>('/api/admin/teams', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Team created');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create team'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateTeamBody) =>
      apiFetch<TeamDto>(`/api/admin/teams/${isEdit ? target.id : ''}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Team updated');
      invalidate();
      onOpenChange(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update team'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { name, description: description || undefined };
    if (isEdit) {
      updateMutation.mutate(body);
    } else {
      createMutation.mutate(body);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${target.name}` : 'New team'}</DialogTitle>
          <DialogDescription>Add members after creating the team.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Name</Label>
            <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={150} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-description">Description</Label>
            <Input id="team-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

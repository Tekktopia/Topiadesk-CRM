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
import { useCreateAgentSkill, useDirectoryUsers, useUpdateAgentSkill } from '../../_lib/hooks';
import type { AgentSkill } from '../../_lib/types';

/** Create/edit dialog for an agent skill tag — mirrors macros/_components/macro-form-dialog.tsx's plain useState shape (the whole row is passed in, not re-fetched by id). userId is sourced from useDirectoryUsers (identity:read-gated, degrades to an empty list for a caller without that grant — same as every other user-picker select in app/(cases)/**). */
export function AgentSkillFormDialog({
  open,
  onOpenChange,
  skill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill?: AgentSkill;
}) {
  const isEdit = Boolean(skill);
  const { users } = useDirectoryUsers();
  const [userId, setUserId] = React.useState('');
  const [skillTag, setSkillTag] = React.useState('');
  const [proficiency, setProficiency] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    if (skill) {
      setUserId(skill.userId);
      setSkillTag(skill.skillTag);
      setProficiency(skill.proficiency != null ? String(skill.proficiency) : '');
    } else {
      setUserId('');
      setSkillTag('');
      setProficiency('');
    }
  }, [open, skill]);

  const createSkill = useCreateAgentSkill();
  const updateSkill = useUpdateAgentSkill(skill?.id ?? '');
  const isPending = createSkill.isPending || updateSkill.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { userId, skillTag, proficiency: proficiency ? Number(proficiency) : undefined };
    if (isEdit && skill) {
      await updateSkill.mutateAsync(payload);
    } else {
      await createSkill.mutateAsync(payload);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit agent skill' : 'New agent skill'}</DialogTitle>
          <DialogDescription>
            Tags an agent with a skill (e.g. &quot;fire&quot;, &quot;marine&quot;, &quot;spanish&quot;) matched against an assignment
            rule&apos;s required skill tags for SKILL_BASED routing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Agent</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skill-tag">Skill tag</Label>
            <Input id="skill-tag" value={skillTag} onChange={(e) => setSkillTag(e.target.value)} required placeholder="e.g. marine" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skill-proficiency">Proficiency (1–5, optional)</Label>
            <Input
              id="skill-proficiency"
              type="number"
              min={1}
              max={5}
              value={proficiency}
              onChange={(e) => setProficiency(e.target.value)}
              placeholder="e.g. 3"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !userId || !skillTag}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Add skill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

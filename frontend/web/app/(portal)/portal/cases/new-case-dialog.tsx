'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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
import { useCreatePortalCase } from '../_lib/queries';

const CASE_TYPES = ['ENQUIRY', 'SERVICE_REQUEST', 'COMPLAINT'] as const;
const CASE_TYPE_LABEL: Record<(typeof CASE_TYPES)[number], string> = {
  ENQUIRY: 'General enquiry',
  SERVICE_REQUEST: 'Service request',
  COMPLAINT: 'Complaint',
};

export function NewCaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [caseType, setCaseType] = useState<(typeof CASE_TYPES)[number]>('ENQUIRY');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const createMutation = useCreatePortalCase();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    createMutation.mutate(
      { caseType, subject: subject.trim(), description: description.trim() || undefined },
      {
        onSuccess: (created) => {
          onOpenChange(false);
          setSubject('');
          setDescription('');
          setCaseType('ENQUIRY');
          router.push(`/portal/cases/${created.id}`);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Raise a new request</DialogTitle>
            <DialogDescription>Tell us what you need — our team will get back to you as soon as possible.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-case-type">Type</Label>
              <Select value={caseType} onValueChange={(v) => setCaseType(v as (typeof CASE_TYPES)[number])}>
                <SelectTrigger id="new-case-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {CASE_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-case-subject">Subject</Label>
              <Input id="new-case-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly summarize your request" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-case-description">Details (optional)</Label>
              <textarea
                id="new-case-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-brand-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </div>
            {createMutation.isError ? (
              <p className="text-sm text-destructive">{createMutation.error instanceof Error ? createMutation.error.message : 'Something went wrong — please try again.'}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || subject.trim().length === 0}>
              {createMutation.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

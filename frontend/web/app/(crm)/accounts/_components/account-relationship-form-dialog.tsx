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
  toast,
} from '@topiadesk/ui';
import { relationshipTypeLabel } from '../../_lib/constants';
import { useAccounts, useCreateAccountRelationship, useUpdateAccountRelationship } from '../../_lib/hooks';
import type { AccountRelationship, AccountRelationshipType } from '../../_lib/types';

const RELATIONSHIP_TYPES: AccountRelationshipType[] = ['REFERRAL_SOURCE', 'COMPETITOR', 'JOINT_VENTURE', 'PARENT_SUBSIDIARY', 'OTHER'];

/** Create/edit dialog for an AccountRelationship — the related account is only pickable on create (mirrors PolicyController's accountId-is-set-at-creation convention). */
export function AccountRelationshipFormDialog({
  open,
  onOpenChange,
  accountId,
  relationship,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  relationship?: AccountRelationship;
}) {
  const isEdit = Boolean(relationship);
  const { data: accounts } = useAccounts({ take: 250 });
  const [relatedAccountId, setRelatedAccountId] = React.useState('');
  const [relationshipType, setRelationshipType] = React.useState<AccountRelationshipType>('REFERRAL_SOURCE');
  const [notes, setNotes] = React.useState('');

  React.useEffect(() => {
    if (open) {
      const otherId = relationship ? (relationship.accountAId === accountId ? relationship.accountBId : relationship.accountAId) : '';
      setRelatedAccountId(otherId);
      setRelationshipType(relationship?.relationshipType ?? 'REFERRAL_SOURCE');
      setNotes(relationship?.notes ?? '');
    }
  }, [open, relationship, accountId]);

  const createRelationship = useCreateAccountRelationship(accountId);
  const updateRelationship = useUpdateAccountRelationship(accountId);
  const isPending = createRelationship.isPending || updateRelationship.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!relatedAccountId) {
      toast.error('Choose the related account');
      return;
    }
    if (isEdit && relationship) {
      await updateRelationship.mutateAsync({ id: relationship.id, input: { relationshipType, notes: notes || undefined } });
    } else {
      await createRelationship.mutateAsync({ relatedAccountId, relationshipType, notes: notes || undefined });
    }
    onOpenChange(false);
  }

  const otherAccounts = (accounts ?? []).filter((a) => a.id !== accountId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit relationship' : 'Add relationship'}</DialogTitle>
            <DialogDescription>A lateral link to another account — referral source, competitor, joint venture, etc.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Related account</Label>
              <Select value={relatedAccountId} onValueChange={setRelatedAccountId} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {otherAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEdit ? <p className="text-xs text-muted-foreground">Can&apos;t be changed after creation — remove and re-add instead.</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label>Relationship type</Label>
              <Select value={relationshipType} onValueChange={(v) => setRelationshipType(v as AccountRelationshipType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {relationshipTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="relationship-notes">Notes (optional)</Label>
              <Input id="relationship-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Add relationship'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

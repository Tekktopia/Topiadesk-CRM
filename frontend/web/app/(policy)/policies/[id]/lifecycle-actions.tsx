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
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@topiadesk/ui';
import { ChevronDown, Plus } from 'lucide-react';
import {
  availableVersionTypes,
  directOnlyTransitions,
  type CreatePolicyVersionDto,
  type PolicyDto,
  type PolicyStatus,
  type PolicyVersionType,
} from '@/app/(policy)/lib/types';

const VERSION_TYPE_LABEL: Record<PolicyVersionType, string> = {
  ISSUANCE: 'Issue policy',
  ENDORSEMENT: 'Endorse policy',
  RENEWAL: 'Renew policy',
  CANCELLATION: 'Cancel policy',
  REINSTATEMENT: 'Reinstate policy',
};

/**
 * The policy detail header's action controls: a "Change status" menu for
 * the two transitions with no PolicyVersion equivalent (BOUND, LAPSED —
 * see directOnlyTransitions's comment), and a "New policy version" dialog
 * for everything else (ISSUANCE/ENDORSEMENT/RENEWAL/CANCELLATION/
 * REINSTATEMENT), which is how ENDORSEMENT/CANCELLATION's maker-checker
 * approval gets triggered. Both are hidden entirely once CANCELLED
 * (terminal — POLICY_STATUS_TRANSITIONS.CANCELLED is empty), making the
 * lack of further action explicit rather than a dead disabled button.
 */
export function LifecycleActions({ policy, onChanged }: { policy: PolicyDto; onChanged: () => void }) {
  // policy.status is typed as plain `string` by the generated DTO (the
  // backend's PolicyResponseDto omits an explicit `enum:` swagger hint —
  // see policy-response.dto.ts) even though it's always one of
  // POLICY_STATUSES at runtime (a Prisma enum column); narrow it here for
  // the state-machine helpers, which need the literal union.
  const status = policy.status as PolicyStatus;
  const directTargets = directOnlyTransitions(status);
  const versionTypes = availableVersionTypes(status);
  const [statusPending, setStatusPending] = React.useState(false);

  if (directTargets.length === 0 && versionTypes.length === 0) {
    return <span className="text-sm text-muted-foreground">No further transitions — this policy is in a terminal state.</span>;
  }

  async function changeStatus(status: string) {
    setStatusPending(true);
    try {
      const res = await fetch(`/api/policies/${policy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'Status change failed');
      }
      toast.success(`Policy marked ${status}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status change failed');
    } finally {
      setStatusPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {directTargets.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={statusPending}>
              Change status <ChevronDown className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {directTargets.map((target) => (
              <DropdownMenuItem key={target} onSelect={() => void changeStatus(target)}>
                Mark as {target}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {versionTypes.length > 0 ? <NewVersionDialog policy={policy} versionTypes={versionTypes} onCreated={onChanged} /> : null}
    </div>
  );
}

function NewVersionDialog({
  policy,
  versionTypes,
  onCreated,
}: {
  policy: PolicyDto;
  versionTypes: PolicyVersionType[];
  onCreated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [versionType, setVersionType] = React.useState<PolicyVersionType>(versionTypes[0] ?? 'ISSUANCE');
  const [effectiveDate, setEffectiveDate] = React.useState('');
  const [changeDescription, setChangeDescription] = React.useState('');
  const [premiumImpact, setPremiumImpact] = React.useState('');
  const [sumInsuredAtVersion, setSumInsuredAtVersion] = React.useState(policy.sumInsured ?? '');
  const [submitting, setSubmitting] = React.useState(false);

  const gated = versionType === 'ENDORSEMENT' || versionType === 'CANCELLATION';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveDate) {
      toast.error('Effective date is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreatePolicyVersionDto = {
        versionType,
        effectiveDate,
        changeDescription: changeDescription || undefined,
        premiumImpact: premiumImpact || undefined,
        sumInsuredAtVersion: sumInsuredAtVersion || undefined,
      };
      const res = await fetch(`/api/policies/${policy.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; approvalStatus?: string | null } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Failed to create policy version');

      if (body?.approvalStatus === 'PENDING') {
        toast.info('Submitted for approval — a different user must approve it before it takes effect.');
      } else {
        toast.success(`${VERSION_TYPE_LABEL[versionType]} applied.`);
      }
      setOpen(false);
      setEffectiveDate('');
      setChangeDescription('');
      setPremiumImpact('');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create policy version');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden /> New version
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New policy version</DialogTitle>
            <DialogDescription>
              Records a lifecycle event against {policy.policyNumber}. Endorsement and cancellation are subject to
              maker-checker review — they will not take effect until a different user approves them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="versionType">Type</Label>
              <Select value={versionType} onValueChange={(v) => setVersionType(v as PolicyVersionType)}>
                <SelectTrigger id="versionType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versionTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {VERSION_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {gated ? (
                <p className="text-xs text-warning">Requires approval from a user other than you before it applies.</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="effectiveDate">Effective date</Label>
              <Input id="effectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="changeDescription">Change description</Label>
              <Input
                id="changeDescription"
                value={changeDescription}
                onChange={(e) => setChangeDescription(e.target.value)}
                placeholder="e.g. Add fire and burglary extension"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="premiumImpact">Premium impact</Label>
                <Input
                  id="premiumImpact"
                  inputMode="decimal"
                  value={premiumImpact}
                  onChange={(e) => setPremiumImpact(e.target.value)}
                  placeholder="e.g. 250000.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sumInsuredAtVersion">Sum insured</Label>
                <Input
                  id="sumInsuredAtVersion"
                  inputMode="decimal"
                  value={sumInsuredAtVersion}
                  onChange={(e) => setSumInsuredAtVersion(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : gated ? 'Submit for approval' : 'Apply'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

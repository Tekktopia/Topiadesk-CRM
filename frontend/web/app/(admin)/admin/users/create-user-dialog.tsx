'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
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
import { useBranches, useDepartments, useUsers } from '../_lib/queries';
import { SearchableUserPicker } from '../_components/searchable-user-picker';
import type { CreateUserBody, CreateUserResponse } from '../_lib/types';

const UNASSIGNED = '__unassigned__';

/**
 * The one individual-create path, distinct from the CSV bulk-invite
 * wizard on this same page — same underlying Keycloak provisioning
 * rigor, just for a single person via a real form with real pickers
 * (department/branch/manager) instead of CSV codes. The temporary
 * password is shown once here (mirroring scim-token-create-dialog.tsx's
 * "shown once, copy it now" pattern) — it's also emailed to the new user,
 * but shown here too since the sender may need to hand it over directly.
 */
export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const departmentsQuery = useDepartments();
  const branchesQuery = useBranches();
  const usersQuery = useUsers();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState(UNASSIGNED);
  const [branchId, setBranchId] = useState(UNASSIGNED);
  const [managerId, setManagerId] = useState<string | undefined>(undefined);
  const [positionTitle, setPositionTitle] = useState('');
  const [created, setCreated] = useState<CreateUserResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: (body: CreateUserBody) => apiFetch<CreateUserResponse>('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (result) => {
      setCreated(result);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create user'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      email: email.trim(),
      fullName: fullName.trim(),
      phone: phone.trim() || undefined,
      departmentId: departmentId === UNASSIGNED ? undefined : departmentId,
      branchId: branchId === UNASSIGNED ? undefined : branchId,
      managerId,
      positionTitle: positionTitle.trim() || undefined,
    });
  }

  async function handleCopy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setEmail('');
      setFullName('');
      setPhone('');
      setDepartmentId(UNASSIGNED);
      setBranchId(UNASSIGNED);
      setManagerId(undefined);
      setPositionTitle('');
      setCreated(null);
      setCopied(false);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{created.user.fullName} was created</DialogTitle>
              <DialogDescription>
                Copy this temporary password now — it won&apos;t be shown again here (it&apos;s also been emailed to{' '}
                {created.user.email}). They&apos;ll be asked to set a new password on first sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-password">Temporary password</Label>
              <div className="flex gap-2">
                <Input id="new-user-password" readOnly value={created.temporaryPassword} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" aria-label="Copy password" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New user</DialogTitle>
              <DialogDescription>Creates their Keycloak sign-in and local record in one step.</DialogDescription>
            </DialogHeader>
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-email">Email</Label>
                <Input id="new-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-fullname">Full name</Label>
                <Input id="new-user-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-phone">Phone</Label>
                <Input id="new-user-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {(departmentsQuery.data ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Branch</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {(branchesQuery.data ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Manager</Label>
                <SearchableUserPicker
                  users={usersQuery.data ?? []}
                  value={managerId}
                  onChange={setManagerId}
                  placeholder="No manager set"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-position">Position title</Label>
                <Input
                  id="new-user-position"
                  placeholder="e.g. Team Lead, Supervisor"
                  value={positionTitle}
                  onChange={(e) => setPositionTitle(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || !email.trim() || !fullName.trim()}>
                  {createMutation.isPending ? 'Creating…' : 'Create user'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

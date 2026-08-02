'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  Badge,
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
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import { useUsers } from '../_lib/queries';
import type { AddTeamMemberBody, TeamDetailDto, TeamMemberDto, UpdateTeamMemberBody } from '../_lib/types';

const MEMBER_ROLES = ['MEMBER', 'LEAD'] as const;

export function TeamDetailDialog({
  teamId,
  canWrite,
  open,
  onOpenChange,
}: {
  teamId: string;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const teamQuery = useQuery({
    queryKey: ['admin', 'teams', 'detail', teamId],
    queryFn: () => apiFetch<TeamDetailDto>(`/api/admin/teams/${teamId}`),
    enabled: open,
  });
  const usersQuery = useUsers();

  const [userToAdd, setUserToAdd] = useState('');
  const [roleToAdd, setRoleToAdd] = useState<(typeof MEMBER_ROLES)[number]>('MEMBER');

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
  }

  const addMemberMutation = useMutation({
    mutationFn: (body: AddTeamMemberBody) =>
      apiFetch<TeamMemberDto>(`/api/admin/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Member added');
      setUserToAdd('');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to add member'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: UpdateTeamMemberBody }) =>
      apiFetch<TeamMemberDto>(`/api/admin/teams/${teamId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success('Member role updated');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update member role'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => apiFetch<void>(`/api/admin/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Member removed');
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to remove member'),
  });

  const memberUserIds = useMemo(() => new Set((teamQuery.data?.members ?? []).map((m) => m.userId)), [teamQuery.data]);
  const availableUsers = useMemo(
    () => (usersQuery.data ?? []).filter((u) => !memberUserIds.has(u.id)),
    [usersQuery.data, memberUserIds],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{teamQuery.data?.name ?? 'Team'}</DialogTitle>
          <DialogDescription>{teamQuery.data?.description ?? 'No description'}</DialogDescription>
        </DialogHeader>

        {teamQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : teamQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load this team.</p>
        ) : (
          <div className="space-y-4">
            {(teamQuery.data?.members ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Role</TableHead>
                      {canWrite ? <TableHead className="w-10" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(teamQuery.data?.members ?? []).map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">{m.userFullName}</span>
                            <span className="text-xs text-muted-foreground">{m.userEmail}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            <Select
                              value={m.role}
                              onValueChange={(role) =>
                                updateRoleMutation.mutate({ userId: m.userId, body: { role: role as UpdateTeamMemberBody['role'] } })
                              }
                            >
                              <SelectTrigger className="h-8 w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MEMBER_ROLES.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {r}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">{m.role}</Badge>
                          )}
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${m.userFullName}`}
                              onClick={() => removeMemberMutation.mutate(m.userId)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {canWrite ? (
              <>
                <Separator />
                <div className="flex gap-2">
                  <Select value={userToAdd} onValueChange={setUserToAdd}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Add a user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={roleToAdd} onValueChange={(v) => setRoleToAdd(v as (typeof MEMBER_ROLES)[number])}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEMBER_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={!userToAdd || addMemberMutation.isPending}
                    onClick={() => userToAdd && addMemberMutation.mutate({ userId: userToAdd, role: roleToAdd })}
                  >
                    Add
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import * as React from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Avatar, AvatarFallback, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@topiadesk/ui';
import { useAddWatcher, useDirectoryUsers, useRemoveWatcher, useWatchers } from '../_lib/hooks';
import { EmptyState } from './empty-state';

/** Who gets notified on updates to this Claim/Case — CaseWatcher rows keyed by claimId/caseId (dual-nullable FK, see the schema's Phase 2 doc comment). Shared by both detail pages. */
export function WatchersPanel({ entity, entityId }: { entity: 'claims' | 'cases'; entityId: string }) {
  const { data: watchers, isLoading } = useWatchers(entity, entityId);
  const { usersById, users } = useDirectoryUsers();
  const addWatcher = useAddWatcher(entity, entityId);
  const removeWatcher = useRemoveWatcher(entity, entityId);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [manualUserId, setManualUserId] = React.useState('');

  const watchingIds = new Set((watchers ?? []).map((w) => w.userId));
  const candidates = users.filter((u) => !watchingIds.has(u.id));

  function addBy(userId: string) {
    if (!userId) return;
    addWatcher.mutate(userId, {
      onSuccess: () => {
        setSelectedUserId('');
        setManualUserId('');
      },
    });
  }

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
      ) : !watchers || watchers.length === 0 ? (
        <EmptyState title="No watchers" description="Add a user to keep them notified of updates." />
      ) : (
        <ul className="space-y-2">
          {watchers.map((w) => {
            const user = usersById.get(w.userId);
            return (
              <li key={w.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">{(user?.fullName ?? w.userId).slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-foreground">{user?.fullName ?? w.userId}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove watcher"
                  disabled={removeWatcher.isPending}
                  onClick={() => removeWatcher.mutate(w.userId)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {candidates.length > 0 ? (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Add a watcher…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" disabled={!selectedUserId || addWatcher.isPending} onClick={() => addBy(selectedUserId)}>
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : (
        // Directory lookup is best-effort (GET /identity/users needs
        // identity:read — see useDirectoryUsers) — a plain user-id input is
        // the fallback for roles that don't hold it, same as
        // AccountFormDialog's industryId field.
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Input placeholder="User ID (UUID)" value={manualUserId} onChange={(e) => setManualUserId(e.target.value)} />
          </div>
          <Button variant="outline" size="icon" disabled={!manualUserId || addWatcher.isPending} onClick={() => addBy(manualUserId)}>
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}

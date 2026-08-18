'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Circle, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  Skeleton,
  toast,
} from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { csrfHeaders } from '@/lib/csrf';
import { bumpAvatarCacheBust, getAvatarCacheBust } from '@/app/account-menu';
import { ApiKeysCard } from './api-keys-card';
import { MicrosoftMailboxCard } from './microsoft-mailbox-card';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const PRESENCE_OPTIONS = [
  { value: 'ONLINE', label: 'Online', dotClass: 'fill-emerald-500 text-emerald-500' },
  { value: 'AWAY', label: 'Away', dotClass: 'fill-amber-500 text-amber-500' },
  { value: 'OFFLINE', label: 'Offline', dotClass: 'fill-muted-foreground text-muted-foreground' },
] as const;

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

/**
 * Real `/profile` page — the header's "My profile" link 404'd before this
 * existed. Self-service editing (fullName/phone) goes through
 * PATCH /api/auth/profile -> PATCH /identity/me (IdentityController.
 * updateMyProfile, no @RequirePermission — same self-scoped-to-own-id
 * pattern as the existing presence control below it, reused verbatim from
 * app-header.tsx's PresenceMenu). Password/TOTP management is NOT
 * reimplemented here — "Security" links straight to Keycloak's own
 * self-service account console.
 */
export function ProfileView() {
  const { user, isLoading } = useCurrentUser();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setPhone(user.phone ?? '');
    }
  }, [user]);

  const updateProfile = useMutation({
    mutationFn: (input: { fullName: string; phone: string | null }) =>
      fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('PATCH') },
        body: JSON.stringify(input),
      }).then((res) => {
        if (!res.ok) throw new Error('Failed to update profile');
        return res.json();
      }),
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] });
    },
    onError: () => toast.error('Couldn’t update profile'),
  });

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return fetch('/api/auth/avatar', { method: 'POST', headers: csrfHeaders('POST'), body: formData }).then((res) => {
        if (!res.ok) throw new Error('Failed to upload photo');
        return res.json();
      });
    },
    onSuccess: () => {
      bumpAvatarCacheBust();
      toast.success('Profile photo updated');
      queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] });
    },
    onError: () => toast.error('Couldn’t upload photo — try a smaller image (max 5MB)'),
  });

  const removeAvatar = useMutation({
    mutationFn: () => fetch('/api/auth/avatar', { method: 'DELETE', headers: csrfHeaders('DELETE') }).then((res) => {
      if (!res.ok) throw new Error('Failed to remove photo');
      return res.json();
    }),
    onSuccess: () => {
      bumpAvatarCacheBust();
      toast.success('Profile photo removed');
      queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] });
    },
    onError: () => toast.error('Couldn’t remove photo'),
  });

  function handleAvatarFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Image must be 5MB or smaller');
      return;
    }
    uploadAvatar.mutate(file);
  }

  const setPresence = useMutation({
    mutationFn: (value: 'ONLINE' | 'AWAY' | 'OFFLINE') =>
      fetch('/api/auth/presence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('PATCH') },
        body: JSON.stringify({ presenceStatus: value }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] }),
  });

  const accountConsole = useQuery({
    queryKey: ['auth', 'account-console-url'],
    queryFn: async () => {
      const res = await fetch('/api/auth/account-console-url');
      if (!res.ok) return null;
      return (await res.json()) as { url: string };
    },
    staleTime: Infinity,
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    updateProfile.mutate({ fullName: fullName.trim(), phone: phone.trim() || null });
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    return <p className="text-sm text-muted-foreground">Sign in to view your profile.</p>;
  }

  const currentPresence = PRESENCE_OPTIONS.find((o) => o.value === user.presenceStatus) ?? PRESENCE_OPTIONS[2];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Profile</h1>
        <p className="text-sm text-muted-foreground">Your identity, contact details, and account security.</p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <div className="group relative">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadAvatar.isPending}
              aria-label="Change profile photo"
              className="relative flex h-16 w-16 items-center justify-center rounded-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Avatar className="h-16 w-16 text-lg">
                {user.hasAvatar ? <AvatarImage src={`/api/auth/avatar?v=${getAvatarCacheBust()}`} alt="" /> : null}
                <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center rounded-none bg-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                {uploadAvatar.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin text-background" aria-hidden />
                ) : (
                  <Camera className="h-5 w-5 text-background" aria-hidden />
                )}
              </span>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
            {user.hasAvatar ? (
              <button
                type="button"
                onClick={() => removeAvatar.mutate()}
                disabled={removeAvatar.isPending}
                aria-label="Remove profile photo"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-none border border-border bg-background text-muted-foreground shadow-brand-sm hover:text-destructive"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">{user.fullName}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {user.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))}
            </div>
            <button type="button" onClick={() => avatarInputRef.current?.click()} className="pt-1 text-xs font-medium text-primary hover:underline">
              {user.hasAvatar ? 'Change photo' : 'Add a photo'}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
          <CardDescription>Visible to your teammates across TopiaDesk.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-full-name">Full name</Label>
                <Input id="profile-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-phone">Phone</Label>
                <Input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={updateProfile.isPending || !fullName.trim()}>
                {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save changes
              </Button>
            </div>
          </form>

          <Separator className="my-6" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email" value={user.email} />
            <Field label="Department" value={user.departmentName ?? '—'} />
            <Field label="Branch" value={user.branchName ?? '—'} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>What your teammates see next to your name.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {PRESENCE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={option.value === currentPresence.value ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setPresence.mutate(option.value)}
              disabled={setPresence.isPending}
            >
              <Circle className={`h-2.5 w-2.5 ${option.dotClass}`} aria-hidden />
              {option.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Password and two-factor authentication are managed through your account console.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild disabled={!accountConsole.data?.url}>
            <a href={accountConsole.data?.url ?? '#'} target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Manage password &amp; two-factor
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </Button>
        </CardContent>
      </Card>

      <MicrosoftMailboxCard />

      <ApiKeysCard />
    </div>
  );
}

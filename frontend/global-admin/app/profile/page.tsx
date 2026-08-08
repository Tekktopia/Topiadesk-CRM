'use client';

import { ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback, Badge, Card, CardContent, CardHeader, CardTitle } from '@topiadesk/ui';
import { useCurrentPlatformAdmin } from '@/lib/auth/use-current-platform-admin';

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Read-only — there's no self-service profile-edit endpoint yet (name/email
 * changes for a PlatformAdminUser would need their own small admin flow,
 * out of scope for this pass). */
export default function ProfilePage() {
  const { admin, isLoading } = useCurrentPlatformAdmin();

  if (isLoading || !admin) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
        <p className="text-sm text-muted-foreground">Your TopiaDesk Global Admin account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 text-base">
              <AvatarFallback>{initials(admin.fullName)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-base font-semibold text-foreground">{admin.fullName}</p>
              <p className="text-sm text-muted-foreground">{admin.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
            <Badge variant="outline">Platform Admin</Badge>
            <span className="text-xs text-muted-foreground">Full access — every platform admin account has equal permissions today.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

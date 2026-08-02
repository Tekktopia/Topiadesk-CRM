import { CheckCircle2, Link2, Lock, ScrollText, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@topiadesk/ui';
import { PageHeader } from '../_components/page-header';

/**
 * Honest "not yet available" state — there is currently no backend read
 * endpoint for `audit_log`. Confirmed by reading every controller in
 * backend/api/src/modules/identity/ and backend/api/src/common/audit/: the
 * only code touching `audit_log` is AuditService.recordEvent() (write-only,
 * called internally from mutation paths like role/permission grant changes
 * — see roles.controller.ts, users.controller.ts, org-settings.controller.ts)
 * and the DB-level triggers described in docs/architecture.md's "Audit
 * trail" section. No @Controller anywhere exposes a GET for it. Rather than
 * fabricate data or call a nonexistent route, this page documents what IS
 * real (the capture + hash chain) and what's missing (the read API), so an
 * admin isn't misled into thinking there's nothing being recorded.
 */
export default function AuditLogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Every compliance-relevant mutation is captured and hash-chained today. Viewing it here isn't possible yet — the read API doesn't exist."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-muted-foreground" aria-hidden />
            No audit log read endpoint yet
          </CardTitle>
          <CardDescription>
            <code className="font-mono text-xs">backend/api/src/modules/identity/</code> and{' '}
            <code className="font-mono text-xs">backend/api/src/common/audit/audit.service.ts</code> only ever{' '}
            <em>write</em> to <code className="font-mono text-xs">audit_log</code> — there is no{' '}
            <code className="font-mono text-xs">GET</code> route anywhere in backend/api exposing it for reads yet.
            This page intentionally shows no data rather than a fake table, since backend/api is out of scope for
            this build. Exposing a paginated, filterable read endpoint (by entity, actor, date range) is a real
            follow-up item for whoever owns that module next.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            <CardTitle className="text-sm">What is real today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              A DB-level <code className="font-mono text-xs">AFTER INSERT/UPDATE/DELETE</code> trigger writes every
              change on compliance-relevant tables to <code className="font-mono text-xs">audit_log</code>{' '}
              automatically — not something application code can forget to instrument.
            </p>
            <p>
              Role/permission grant changes (which have no natural row id to hook a trigger to) are recorded
              explicitly as <code className="font-mono text-xs">PERMISSION_CHANGE</code> events by{' '}
              <code className="font-mono text-xs">AuditService.recordEvent()</code> — see the Roles page&apos;s grant
              and revoke actions in this Admin UI.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-sm">Tamper-evident by construction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Every row is hash-chained (<code className="font-mono text-xs">sha256(prev_hash + payload)</code>,
              computed in Postgres — not app code) across 8 concurrency lanes, with periodic checkpoints anchoring
              all lanes.
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              The table is structurally append-only: no UPDATE/DELETE RLS policy exists, and those privileges are
              revoked from the runtime role outright — verified in the Phase 0 log by attempting exactly that
              tamper and getting <code className="font-mono text-xs">permission denied</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

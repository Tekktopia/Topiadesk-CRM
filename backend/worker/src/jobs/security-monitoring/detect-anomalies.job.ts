/**
 * Intrusion-detection alerting — the security-audit's single biggest flagged
 * gap: Keycloak's own brute-force lockout (bruteForceProtected, realm
 * config) stops an attack in progress, and the audit-checkpoint job
 * (../audit-checkpoint/create-checkpoint.job.ts) monitors data INTEGRITY
 * (was a row altered after the fact) — but nothing was watching for an
 * attack actually happening, in real time, before this. Three checks, each
 * per active tenant, every 5 minutes:
 *
 *  1. Failed-login bursts — polls Keycloak's admin events API (enabled via
 *     keycloak-realm-provisioning.ts's eventsEnabled, retrofit onto every
 *     already-live realm) for LOGIN_ERROR events in the last 15 minutes
 *     (3x this job's own cadence, so a single missed/delayed run can't
 *     create a detection gap — the same event may be re-seen on the next
 *     run, but the Notification dedupeKey below makes that a no-op, not a
 *     duplicate alert), grouped by username. 5+ failures for the same
 *     username raises one alert.
 *  2. Permission-denied bursts — PermissionGuard (common/auth/
 *     permission.guard.ts) now records an ACCESS_DENIED audit_log row on
 *     every coarse "zero grant at any scope" denial; 5+ for the same actor
 *     in 15 minutes raises one alert.
 *  3. Off-hours admin activity — any audit_log row authored by an
 *     ADMIN-role actor between 00:00-05:00 server time. Deliberately a
 *     fixed-hours heuristic, NOT BusinessHoursCalendar (that's per-
 *     department/branch-configurable with no single org-wide "the"
 *     business hours — correctly resolving "off hours for THIS admin" would
 *     need per-user timezone/department resolution, real scope beyond what
 *     this pass buys), same "simple and honestly-scoped over falsely
 *     precise" call as every other heuristic already in this codebase
 *     (e.g. RENEWAL_STATUS_WEIGHTS's own doc comment).
 *
 * All three write a Notification to that tenant's ADMIN/COMPLIANCE_OFFICER
 * users — same IN_APP+EMAIL fan-out shape as create-checkpoint.job.ts's
 * alertOnTamperDetected, and a SECURITY_ALERT audit_log row of its own (the
 * alert IS itself a compliance-relevant event worth its own durable record).
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Prisma } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { masterFetch, safeBody } from '../../keycloak-master-client.util';

export const DETECT_ANOMALIES_QUEUE_NAME = 'detect-anomalies';
const DETECT_ANOMALIES_SCHEDULER_ID = 'detect-anomalies-scheduler';
const DETECT_ANOMALIES_INTERVAL_MS = 5 * 60 * 1000;

const LOOKBACK_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_THRESHOLD = 5;
const ACCESS_DENIED_THRESHOLD = 5;
const OFF_HOURS_START = 0;
const OFF_HOURS_END = 5;

interface KeycloakLoginEvent {
  time: number;
  type: string;
  ipAddress?: string;
  details?: Record<string, string>;
}

interface AlertRecipient {
  id: string;
}

async function alertRecipients(): Promise<AlertRecipient[]> {
  return getPrismaClient().user.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: { name: { in: ['ADMIN', 'COMPLIANCE_OFFICER'] } } } } },
    select: { id: true },
  });
}

/** Fans a security alert out to every ADMIN/COMPLIANCE_OFFICER (IN_APP+EMAIL) and records it as its own SECURITY_ALERT audit_log row — mirrors AuditService.recordEvent()'s exact Prisma shape (chainLane/currentHash are trigger-computed placeholders); backend/worker has no NestJS DI container to inject the real AuditService, see keycloak-realm-provisioning.ts's own header comment for the same reasoning. */
async function raiseAlert(params: { title: string; body: string; dedupeKeySuffix: string; changedFields: Record<string, unknown> }): Promise<number> {
  const prisma = getPrismaClient();
  const recipients = await alertRecipients();

  await prisma.auditLog.create({
    data: {
      entityType: 'security_alert',
      entityId: SYSTEM_JOB_CONTEXT.userId || '00000000-0000-0000-0000-000000000000',
      action: 'SECURITY_ALERT',
      actorSystemJob: 'detect-anomalies',
      changedFields: params.changedFields as Prisma.InputJsonValue,
      chainLane: 0,
      currentHash: '',
    },
  });

  if (recipients.length === 0) return 0;

  await prisma.notification.createMany({
    data: recipients.flatMap(({ id: userId }) => [
      {
        recipientUserId: userId,
        type: 'SECURITY_ANOMALY_DETECTED',
        title: params.title,
        body: params.body,
        channel: 'IN_APP' as const,
        status: 'PENDING' as const,
        dedupeKey: `security-alert:${params.dedupeKeySuffix}:${userId}:IN_APP`,
      },
      {
        recipientUserId: userId,
        type: 'SECURITY_ANOMALY_DETECTED',
        title: params.title,
        body: params.body,
        channel: 'EMAIL' as const,
        status: 'PENDING' as const,
        dedupeKey: `security-alert:${params.dedupeKeySuffix}:${userId}:EMAIL`,
      },
    ]),
    skipDuplicates: true,
  });
  return recipients.length;
}

/** 15-minute bucket boundary, used as part of the dedupeKey so this job's own overlapping lookback windows collapse into one alert instead of re-notifying every run while a burst is ongoing. */
function windowBucket(now: Date): string {
  return String(Math.floor(now.getTime() / LOOKBACK_MS));
}

async function checkFailedLoginBursts(realmName: string, since: Date, now: Date): Promise<{ alerted: number; bursts: number }> {
  const qs = new URLSearchParams({ type: 'LOGIN_ERROR', dateFrom: since.toISOString().slice(0, 10), max: '200' });
  const res = await masterFetch(`/admin/realms/${encodeURIComponent(realmName)}/events?${qs.toString()}`, { method: 'GET' });
  if (!res.ok) {
    console.error(`[detect-anomalies] failed to fetch events for realm "${realmName}" (${res.status}): ${await safeBody(res)}`);
    return { alerted: 0, bursts: 0 };
  }
  const events = (await res.json()) as KeycloakLoginEvent[];
  const sinceMs = since.getTime();

  const byUsername = new Map<string, number>();
  for (const event of events) {
    if (event.type !== 'LOGIN_ERROR' || event.time < sinceMs) continue;
    const username = event.details?.username;
    if (!username) continue;
    byUsername.set(username, (byUsername.get(username) ?? 0) + 1);
  }

  let alerted = 0;
  let bursts = 0;
  const bucket = windowBucket(now);
  for (const [username, count] of byUsername) {
    if (count < LOGIN_FAILURE_THRESHOLD) continue;
    bursts++;
    alerted = await raiseAlert({
      title: 'Repeated failed login attempts',
      body: `${count} failed login attempt(s) for "${username}" on realm "${realmName}" in the last ${LOOKBACK_MS / 60_000} minutes. Keycloak's brute-force protection may already be throttling this account — review it.`,
      dedupeKeySuffix: `login:${realmName}:${username}:${bucket}`,
      changedFields: { realmName, username, count, kind: 'LOGIN_FAILURE_BURST' },
    });
  }
  return { alerted, bursts };
}

async function checkAccessDeniedBursts(now: Date, since: Date): Promise<{ alerted: number; bursts: number }> {
  const prisma = getPrismaClient();
  const denials = await prisma.auditLog.groupBy({
    by: ['actorUserId'],
    where: { action: 'ACCESS_DENIED', createdAt: { gte: since }, actorUserId: { not: null } },
    _count: { actorUserId: true },
  });

  let alerted = 0;
  let bursts = 0;
  const bucket = windowBucket(now);
  for (const row of denials) {
    const count = row._count.actorUserId;
    if (count < ACCESS_DENIED_THRESHOLD || !row.actorUserId) continue;
    bursts++;
    const actor = await prisma.user.findUnique({ where: { id: row.actorUserId }, select: { fullName: true, email: true } });
    alerted = await raiseAlert({
      title: 'Repeated permission-denied attempts',
      body: `${actor?.fullName ?? row.actorUserId} (${actor?.email ?? 'unknown email'}) was denied access ${count} time(s) in the last ${LOOKBACK_MS / 60_000} minutes — no permission grant at all for what they tried to reach, not just an out-of-scope row. Review for a misconfigured client, or a real probing attempt.`,
      dedupeKeySuffix: `access-denied:${row.actorUserId}:${bucket}`,
      changedFields: { actorUserId: row.actorUserId, count, kind: 'ACCESS_DENIED_BURST' },
    });
  }
  return { alerted, bursts };
}

async function checkOffHoursAdminActivity(since: Date): Promise<{ alerted: number; events: number }> {
  const prisma = getPrismaClient();
  const rows = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: since },
      actorUser: { roles: { some: { role: { name: 'ADMIN' } } } },
    },
    select: { id: true, actorUserId: true, entityType: true, action: true, createdAt: true, actorUser: { select: { fullName: true, email: true } } },
    take: 200,
  });

  const offHours = rows.filter((r) => {
    const hour = r.createdAt.getUTCHours();
    return hour >= OFF_HOURS_START && hour < OFF_HOURS_END;
  });

  let alerted = 0;
  for (const row of offHours) {
    alerted = await raiseAlert({
      title: 'Admin activity outside normal hours',
      body: `${row.actorUser?.fullName ?? row.actorUserId} (${row.actorUser?.email ?? 'unknown email'}) performed a ${row.action} on ${row.entityType} at ${row.createdAt.toISOString()} (${OFF_HOURS_START}:00-${OFF_HOURS_END}:00 UTC window). Confirm this was expected.`,
      dedupeKeySuffix: `off-hours:${row.id}`,
      changedFields: { auditLogId: row.id.toString(), actorUserId: row.actorUserId, action: row.action, entityType: row.entityType, kind: 'OFF_HOURS_ADMIN_ACTION' },
    });
  }
  return { alerted, events: offHours.length };
}

export interface TenantAnomalyResult {
  schemaName: string;
  realmName: string;
  loginFailureBursts: number;
  accessDeniedBursts: number;
  offHoursEvents: number;
}

async function detectForTenant(schemaName: string, realmName: string, now: Date, since: Date): Promise<TenantAnomalyResult> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: schemaName }, async () => {
    const [logins, denials, offHours] = await Promise.all([
      checkFailedLoginBursts(realmName, since, now),
      checkAccessDeniedBursts(now, since),
      checkOffHoursAdminActivity(since),
    ]);
    return {
      schemaName,
      realmName,
      loginFailureBursts: logins.bursts,
      accessDeniedBursts: denials.bursts,
      offHoursEvents: offHours.events,
    };
  });
}

export async function runDetectAnomalies(): Promise<TenantAnomalyResult[]> {
  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_MS);

  const tenants = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPlatformPrismaClient().tenant.findMany({ where: { status: 'ACTIVE' }, select: { schemaName: true, keycloakRealm: true } }),
  );

  const results: TenantAnomalyResult[] = [];
  for (const tenant of tenants) {
    results.push(await detectForTenant(tenant.schemaName, tenant.keycloakRealm, now, since));
  }
  return results;
}

export function createDetectAnomaliesQueue(connection: Redis): Queue {
  return new Queue(DETECT_ANOMALIES_QUEUE_NAME, { connection });
}

export function createDetectAnomaliesWorker(connection: Redis): Worker {
  return new Worker(
    DETECT_ANOMALIES_QUEUE_NAME,
    async (_job: Job) => {
      const results = await runDetectAnomalies();
      for (const r of results) {
        console.log(
          `[detect-anomalies] ${r.schemaName} (${r.realmName}): ${r.loginFailureBursts} login-failure burst(s), ${r.accessDeniedBursts} access-denied burst(s), ${r.offHoursEvents} off-hours admin event(s)`,
        );
      }
      return results;
    },
    { connection },
  );
}

export async function scheduleDetectAnomalies(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(DETECT_ANOMALIES_SCHEDULER_ID, { every: DETECT_ANOMALIES_INTERVAL_MS }, { name: 'detect' });
}

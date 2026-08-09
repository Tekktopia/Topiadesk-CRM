/**
 * Turns a `Tenant` row (created by backend/api's POST /platform/tenants
 * with status=PROVISIONING, schemaName/keycloakRealm already decided from
 * its slug) into a fully working tenant: its own Postgres schema with the
 * full packages/db table set + RLS + baseline org structure, its own
 * Keycloak realm, and one real ADMIN user who can actually sign in.
 *
 * Deliberately NOT auto-retried or auto-rolled-back on failure: schema
 * creation is close to idempotent (CREATE SCHEMA IF NOT EXISTS) but
 * Keycloak realm creation is not (a retry after a realm already exists
 * 409s) — a failed run is left as partial state with a FAILED
 * TenantProvisioningEvent recording exactly which step and why, for a
 * human to inspect and clean up or resume by hand. Same "Phase 1, not a
 * full saga engine" scoping as the rest of this pass — see the plan.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { PrismaClient, createTenantSchema, applyTenantMigrations, applyTenantRlsAndTriggers, seedBaseline, tenantSchemaUrl } from '@topiadesk/db';
import { getPlatformPrismaClient, type TenantStatus } from '@topiadesk/db-platform';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { sendMail } from '../scheduled-reports/mailer';
import { createTenantRealm, createTenantAdminUser } from './keycloak-realm-provisioning';

export const PROVISION_TENANT_QUEUE_NAME = 'provision-tenant';

export interface ProvisionTenantJobData {
  tenantId: string;
}

type StepStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export async function provisionTenant(data: ProvisionTenantJobData): Promise<{ status: 'provisioned' | 'failed' }> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const platformPrisma = getPlatformPrismaClient();
    const env = loadEnv();

    const tenant = await platformPrisma.tenant.findUnique({ where: { id: data.tenantId } });
    if (!tenant) {
      console.error(`[provision-tenant] tenant ${data.tenantId} not found — nothing to provision.`);
      return { status: 'failed' };
    }

    const logEvent = (step: string, status: StepStatus, detail?: string) =>
      platformPrisma.tenantProvisioningEvent.create({
        data: { tenantId: tenant.id, step, status: status as never, detail },
      });

    const markFailed = async (step: string, err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[provision-tenant] tenant ${tenant.id} (${tenant.slug}) failed at ${step}:`, err);
      await logEvent(step, 'FAILED', detail);
      await platformPrisma.tenant.update({ where: { id: tenant.id }, data: { status: 'FAILED' as TenantStatus } });
      // One insertion point covers every catch site in this function — see
      // the "Deliberately NOT auto-retried" header comment above for why
      // there are several distinct failure points that all funnel here.
      await platformPrisma.platformNotification.create({
        data: {
          type: 'TENANT_PROVISIONING_FAILED',
          title: `Tenant "${tenant.name}" provisioning failed`,
          body: `Failed at step: ${step}`,
          entityType: 'tenants',
          entityId: tenant.id,
        },
      });
    };

    try {
      await logEvent('CREATE_SCHEMA', 'IN_PROGRESS');
      await createTenantSchema({ schemaName: tenant.schemaName, directUrl: env.DIRECT_URL });
      await logEvent('CREATE_SCHEMA', 'COMPLETED');
    } catch (err) {
      await markFailed('CREATE_SCHEMA', err);
      return { status: 'failed' };
    }

    try {
      await logEvent('APPLY_MIGRATIONS', 'IN_PROGRESS');
      await applyTenantMigrations({ schemaName: tenant.schemaName, directUrl: env.DIRECT_URL });
      await logEvent('APPLY_MIGRATIONS', 'COMPLETED');
    } catch (err) {
      await markFailed('APPLY_MIGRATIONS', err);
      return { status: 'failed' };
    }

    try {
      await logEvent('APPLY_RLS', 'IN_PROGRESS');
      await applyTenantRlsAndTriggers({ schemaName: tenant.schemaName, directUrl: env.DIRECT_URL });
      await logEvent('APPLY_RLS', 'COMPLETED');
    } catch (err) {
      await markFailed('APPLY_RLS', err);
      return { status: 'failed' };
    }

    // One-off PrismaClient scoped to the new tenant schema — used only for
    // this provisioning run, not cached/reused for ongoing requests (the
    // main app's actual runtime traffic goes through @topiadesk/db's own
    // keyed cache instead — see client.ts). Deliberately built off
    // DIRECT_URL (bypasses PgBouncer entirely, straight to Postgres, same
    // as createTenantSchema/applyTenantMigrations/applyTenantRlsAndTriggers
    // above) rather than the pooled DATABASE_URL client.ts's cache uses —
    // this one-shot client only ever runs ONE seed script's worth of
    // queries, so it doesn't need PgBouncer's pooling benefit, and
    // DIRECT_URL sidesteps the whole PgBouncer-transaction-mode class of
    // concern client.ts's header comment documents in detail.
    const tenantPrisma = new PrismaClient({ datasources: { db: { url: tenantSchemaUrl(env.DIRECT_URL, tenant.schemaName) } } });
    let baseline: Awaited<ReturnType<typeof seedBaseline>>;
    try {
      await logEvent('SEED_BASELINE', 'IN_PROGRESS');
      baseline = await seedBaseline(tenantPrisma);
      await logEvent('SEED_BASELINE', 'COMPLETED');
    } catch (err) {
      await markFailed('SEED_BASELINE', err);
      await tenantPrisma.$disconnect();
      return { status: 'failed' };
    }

    let keycloakUser: { keycloakSubjectId: string; temporaryPassword: string };
    try {
      await logEvent('CREATE_KEYCLOAK_REALM', 'IN_PROGRESS');
      await createTenantRealm({ realmName: tenant.keycloakRealm, displayName: tenant.name, tenantSlug: tenant.slug });
      await logEvent('CREATE_KEYCLOAK_REALM', 'COMPLETED');

      await logEvent('CREATE_ADMIN_USER', 'IN_PROGRESS');
      keycloakUser = await createTenantAdminUser({
        realmName: tenant.keycloakRealm,
        email: tenant.primaryContactEmail,
        fullName: `${tenant.name} Admin`,
      });
      await logEvent('CREATE_ADMIN_USER', 'COMPLETED');
    } catch (err) {
      await markFailed('CREATE_KEYCLOAK_REALM', err);
      await tenantPrisma.$disconnect();
      return { status: 'failed' };
    }

    try {
      await logEvent('CREATE_ADMIN_DB_USER', 'IN_PROGRESS');
      // First entries of the baseline scaffold this tenant's admin lands
      // in — a starting point the tenant can rename/reorganize post-signup
      // (see this batch's Identity/Carriers enterprise passes for the
      // admin tooling to do that), not a permanent assumption about their
      // real org structure.
      const adminDbUser = await tenantPrisma.user.create({
        data: {
          keycloakSubjectId: keycloakUser.keycloakSubjectId,
          email: tenant.primaryContactEmail,
          fullName: `${tenant.name} Admin`,
          departmentId: baseline.departments.corporateBroking.id,
          branchId: baseline.branches.lagosHq.id,
        },
      });
      await tenantPrisma.userRole.create({ data: { userId: adminDbUser.id, roleId: baseline.roles.admin.id } });
      await logEvent('CREATE_ADMIN_DB_USER', 'COMPLETED');
    } catch (err) {
      await markFailed('CREATE_ADMIN_DB_USER', err);
      await tenantPrisma.$disconnect();
      return { status: 'failed' };
    } finally {
      await tenantPrisma.$disconnect();
    }

    await platformPrisma.tenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE' as TenantStatus } });
    await logEvent('MARK_ACTIVE', 'COMPLETED');
    await platformPrisma.platformNotification.create({
      data: { type: 'TENANT_PROVISIONED', title: `Tenant "${tenant.name}" provisioned`, entityType: 'tenants', entityId: tenant.id },
    });

    // Invite email failure doesn't roll back an otherwise-successfully-
    // provisioned tenant — the admin can always be sent their credentials
    // again by hand. Logged as its own event either way for visibility in
    // the Global Admin UI's provisioning timeline.
    try {
      await logEvent('SEND_INVITE_EMAIL', 'IN_PROGRESS');
      await sendMail({
        to: tenant.primaryContactEmail,
        subject: `Your TopiaDesk account for ${tenant.name} is ready`,
        text: `Hi,\n\nYour TopiaDesk workspace "${tenant.name}" has been provisioned.\n\nSign-in username: ${tenant.primaryContactEmail}\nTemporary password: ${keycloakUser.temporaryPassword}\n\nYou'll be asked to set a new password and configure two-factor authentication on first sign-in.`,
      });
      await logEvent('SEND_INVITE_EMAIL', 'COMPLETED');
    } catch (err) {
      await logEvent('SEND_INVITE_EMAIL', 'FAILED', err instanceof Error ? err.message : String(err));
    }

    console.log(`[provision-tenant] tenant ${tenant.id} (${tenant.slug}) provisioned successfully.`);
    return { status: 'provisioned' };
  });
}

export function createProvisionTenantQueue(connection: Redis): Queue {
  return new Queue(PROVISION_TENANT_QUEUE_NAME, { connection });
}

export function createProvisionTenantWorker(connection: Redis): Worker {
  return new Worker(
    PROVISION_TENANT_QUEUE_NAME,
    async (job: Job<ProvisionTenantJobData>) => {
      const result = await provisionTenant(job.data);
      console.log(`[provision-tenant] ${job.id}: ${result.status}`);
      return result;
    },
    { connection, concurrency: 1 },
  );
}

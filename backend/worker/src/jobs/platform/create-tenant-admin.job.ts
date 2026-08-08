/**
 * Consumer side of "Global Admin creates an additional tenant admin" —
 * generalizes provision-tenant.job.ts's CREATE_ADMIN_USER/CREATE_ADMIN_DB_USER
 * steps into a standalone job usable after a tenant is already ACTIVE (that
 * job's baseline-seeded department/branch IDs don't apply here — this admin
 * is created with no department/branch, same as any other nullable-FK user,
 * left for the tenant's own admins to assign via their existing PATCH
 * /identity/users/:id). Single-step job, same shape as
 * create-platform-admin.job.ts, not provision-tenant.job.ts's saga.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { PrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, tenantSchemaUrl } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { sendMail } from '../scheduled-reports/mailer';
import { createTenantAdminUser } from './keycloak-realm-provisioning';

export const CREATE_TENANT_ADMIN_QUEUE_NAME = 'create-tenant-admin';

export interface CreateTenantAdminJobData {
  tenantId: string;
  email: string;
  fullName: string;
}

type CreateResult = { status: 'created' | 'failed'; reason?: string };

export async function createTenantAdmin(data: CreateTenantAdminJobData): Promise<CreateResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const env = loadEnv();
    const platformPrisma = getPlatformPrismaClient();

    const tenant = await platformPrisma.tenant.findUnique({ where: { id: data.tenantId } });
    if (!tenant) {
      return { status: 'failed', reason: 'Tenant not found' };
    }

    let keycloakUser: { keycloakSubjectId: string; temporaryPassword: string };
    try {
      keycloakUser = await createTenantAdminUser({ realmName: tenant.keycloakRealm, email: data.email, fullName: data.fullName });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[create-tenant-admin] Keycloak user creation failed for tenant ${tenant.id}/"${data.email}":`, err);
      return { status: 'failed', reason };
    }

    const tenantPrisma = new PrismaClient({ datasources: { db: { url: tenantSchemaUrl(env.DIRECT_URL, tenant.schemaName) } } });
    try {
      const adminRole = await tenantPrisma.role.findFirst({ where: { name: 'ADMIN' } });
      if (!adminRole) {
        return { status: 'failed', reason: `Tenant ${tenant.id} has no ADMIN role — baseline seed may be incomplete` };
      }
      const user = await tenantPrisma.user.create({
        data: { keycloakSubjectId: keycloakUser.keycloakSubjectId, email: data.email, fullName: data.fullName },
      });
      await tenantPrisma.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });
    } finally {
      await tenantPrisma.$disconnect();
    }

    try {
      await sendMail({
        to: data.email,
        subject: `Your TopiaDesk account for ${tenant.name} is ready`,
        text: `Hi ${data.fullName},\n\nAn admin account for "${tenant.name}" has been created for you.\n\nSign-in username: ${data.email}\nTemporary password: ${keycloakUser.temporaryPassword}\n\nYou'll be asked to set a new password and configure two-factor authentication on first sign-in.`,
      });
    } catch (err) {
      console.error(`[create-tenant-admin] invite email failed for tenant ${tenant.id}/"${data.email}" (account still created):`, err);
    }

    return { status: 'created' };
  });
}

export function createCreateTenantAdminQueue(connection: Redis): Queue {
  return new Queue(CREATE_TENANT_ADMIN_QUEUE_NAME, { connection });
}

export function createCreateTenantAdminWorker(connection: Redis): Worker {
  return new Worker(
    CREATE_TENANT_ADMIN_QUEUE_NAME,
    async (job: Job<CreateTenantAdminJobData>) => {
      const result = await createTenantAdmin(job.data);
      console.log(`[create-tenant-admin] ${job.id}: ${result.status}`);
      return result;
    },
    { connection, concurrency: 1 },
  );
}

/**
 * Consumer side of platform-admin account creation — see
 * backend/api/src/modules/platform/create-platform-admin-queue.ts's header
 * comment for the producer side. Single-step job (unlike provision-tenant's
 * multi-step saga): create the Keycloak user in the "topiadesk-platform"
 * realm, create the matching PlatformAdminUser row, email the temp
 * password. Modeled on send-portal-login-link.job.ts's shape, not
 * provision-tenant.job.ts's — this has no multi-step timeline to log.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { sendMail } from '../scheduled-reports/mailer';
import { createPlatformAdminKeycloakUser } from './keycloak-realm-provisioning';

export const CREATE_PLATFORM_ADMIN_QUEUE_NAME = 'create-platform-admin';

export interface CreatePlatformAdminJobData {
  email: string;
  fullName: string;
}

type CreateResult = { status: 'created' | 'failed'; reason?: string };

export async function createPlatformAdmin(data: CreatePlatformAdminJobData): Promise<CreateResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const env = loadEnv();
    const platformPrisma = getPlatformPrismaClient();

    let keycloakUser: { keycloakSubjectId: string; temporaryPassword: string };
    try {
      keycloakUser = await createPlatformAdminKeycloakUser({
        platformRealm: env.KEYCLOAK_PLATFORM_REALM,
        email: data.email,
        fullName: data.fullName,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[create-platform-admin] Keycloak user creation failed for "${data.email}":`, err);
      return { status: 'failed', reason };
    }

    await platformPrisma.platformAdminUser.create({
      data: {
        keycloakSubjectId: keycloakUser.keycloakSubjectId,
        email: data.email,
        fullName: data.fullName,
        status: 'ACTIVE',
      },
    });

    try {
      await sendMail({
        to: data.email,
        subject: 'Your TopiaDesk Global Admin account is ready',
        text: `Hi ${data.fullName},\n\nA TopiaDesk Global Admin account has been created for you.\n\nSign-in username: ${data.email}\nTemporary password: ${keycloakUser.temporaryPassword}\n\nYou'll be asked to set a new password and configure two-factor authentication on first sign-in.`,
      });
    } catch (err) {
      // Same reasoning as provision-tenant.job.ts's SEND_INVITE_EMAIL step:
      // the account is already fully created and usable — a failed invite
      // email doesn't roll that back, an operator can relay the temp
      // password by hand if needed.
      console.error(`[create-platform-admin] invite email failed for "${data.email}" (account still created):`, err);
    }

    return { status: 'created' };
  });
}

export function createCreatePlatformAdminQueue(connection: Redis): Queue {
  return new Queue(CREATE_PLATFORM_ADMIN_QUEUE_NAME, { connection });
}

export function createCreatePlatformAdminWorker(connection: Redis): Worker {
  return new Worker(
    CREATE_PLATFORM_ADMIN_QUEUE_NAME,
    async (job: Job<CreatePlatformAdminJobData>) => {
      const result = await createPlatformAdmin(job.data);
      console.log(`[create-platform-admin] ${job.id}: ${result.status}`);
      return result;
    },
    { connection, concurrency: 1 },
  );
}

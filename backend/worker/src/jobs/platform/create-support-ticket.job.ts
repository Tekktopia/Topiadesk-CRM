/**
 * Consumer side of tenant-submitted support tickets — see
 * backend/api/src/modules/support/create-support-ticket-queue.ts's header
 * comment for the producer side and this session's plan's Decision 5 for
 * why ticket creation from a tenant-authenticated request goes through a
 * queue instead of a direct write.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';

export const CREATE_SUPPORT_TICKET_QUEUE_NAME = 'create-support-ticket';

export interface CreateSupportTicketJobData {
  tenantSchema: string;
  subject: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  raisedByEmail: string;
  raisedByName: string;
}

type CreateResult = { status: 'created' | 'failed'; reason?: string };

export async function createSupportTicket(data: CreateSupportTicketJobData): Promise<CreateResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const platformPrisma = getPlatformPrismaClient();
    const tenant = await platformPrisma.tenant.findFirst({ where: { schemaName: data.tenantSchema } });
    if (!tenant) {
      return { status: 'failed', reason: `No tenant found for schema "${data.tenantSchema}"` };
    }
    await platformPrisma.supportTicket.create({
      data: {
        tenantId: tenant.id,
        subject: data.subject,
        description: data.description,
        priority: data.priority,
        raisedByEmail: data.raisedByEmail,
        raisedByName: data.raisedByName,
      },
    });
    return { status: 'created' };
  });
}

export function createCreateSupportTicketQueue(connection: Redis): Queue {
  return new Queue(CREATE_SUPPORT_TICKET_QUEUE_NAME, { connection });
}

export function createCreateSupportTicketWorker(connection: Redis): Worker {
  return new Worker(
    CREATE_SUPPORT_TICKET_QUEUE_NAME,
    async (job: Job<CreateSupportTicketJobData>) => {
      const result = await createSupportTicket(job.data);
      console.log(`[create-support-ticket] ${job.id}: ${result.status}`);
      return result;
    },
    { connection, concurrency: 1 },
  );
}

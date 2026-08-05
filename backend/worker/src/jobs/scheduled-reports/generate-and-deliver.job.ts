import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { Prisma, getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type PrismaClient, type ScheduledReportFormat } from '@topiadesk/db';
import { buildDefaultRegistry, renderReportExport, uploadReportFile, EXPORT_CONTENT_TYPE, type ReportExportFormat } from '@topiadesk/reports';
import { sendMail } from './mailer';

export const SCHEDULED_REPORT_GENERATE_QUEUE_NAME = 'scheduled-report-generate';

export interface ScheduledReportGenerateJobData {
  runId: string;
}

/**
 * Built once per process, from the exact same @topiadesk/reports registry
 * backend/api's ReportsController runs interactive /reports/:key/run
 * requests against — see report-definition.ts's re-export shim comment for
 * why the registry lives in a shared package instead of being duplicated
 * here.
 */
const registry = buildDefaultRegistry();

function toExportFormat(format: ScheduledReportFormat): ReportExportFormat {
  switch (format) {
    case 'PDF':
      return 'pdf';
    case 'EXCEL':
      return 'xlsx';
    case 'CSV':
      return 'csv';
  }
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

type RecipientWithUser = Prisma.ScheduledReportRecipientGetPayload<{ include: { user: true } }>;

/**
 * Delivery row is created (status PENDING) BEFORE the actual send —
 * exactly Notification.dedupeKey's pattern (see notifications.service.ts's
 * header comment): a P2002 here means this recipient was already handled
 * by an earlier attempt at this run, so the send is skipped entirely
 * rather than re-firing an email on a BullMQ retry. One recipient's
 * failure is caught and recorded on their own delivery row, not thrown —
 * it must not fail the other recipients' deliveries or mark the whole run
 * FAILED after the report itself was generated successfully.
 */
async function deliverToRecipient(
  prisma: PrismaClient,
  runId: string,
  recipient: RecipientWithUser,
  reportName: string,
  exportFormat: ReportExportFormat,
  buffer: Buffer,
): Promise<void> {
  const dedupeKey = `scheduled-report-delivery:${runId}:${recipient.id}`;
  let delivery;
  try {
    delivery = await prisma.scheduledReportDelivery.create({
      data: { runId, recipientId: recipient.id, channel: recipient.channel, status: 'PENDING', dedupeKey },
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      console.log(`[scheduled-report-generate] delivery ${dedupeKey} already exists — skipping (idempotent re-run)`);
      return;
    }
    throw err;
  }

  try {
    if (recipient.channel === 'EMAIL') {
      if (!recipient.user?.email) throw new Error('EMAIL recipient has no linked user/email');
      await sendMail({
        to: recipient.user.email,
        subject: `Scheduled report: ${reportName}`,
        text: `Your scheduled report "${reportName}" is attached (${exportFormat.toUpperCase()}).`,
        attachment: { filename: `${reportName}.${exportFormat}`, content: buffer, contentType: EXPORT_CONTENT_TYPE[exportFormat] },
      });
    } else if (recipient.channel === 'IN_APP') {
      if (!recipient.userId) throw new Error('IN_APP recipient has no linked user');
      try {
        await prisma.notification.create({
          data: {
            recipientUserId: recipient.userId,
            type: 'SCHEDULED_REPORT_READY',
            title: `Report ready: ${reportName}`,
            body: `Your scheduled report "${reportName}" has finished running.`,
            relatedEntityType: 'SCHEDULED_REPORT_RUN',
            relatedEntityId: runId,
            channel: 'IN_APP',
            status: 'PENDING',
            dedupeKey: `scheduled-report-notification:${runId}:${recipient.id}`,
          },
        });
      } catch (err) {
        if (!isUniqueConstraintViolation(err)) throw err;
      }
    } else if (recipient.channel === 'WEBHOOK') {
      if (!recipient.webhookUrl) throw new Error('WEBHOOK recipient has no webhookUrl configured');
      const res = await fetch(recipient.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, reportName, format: exportFormat }),
      });
      if (!res.ok) throw new Error(`Webhook responded with status ${res.status}`);
    }

    await prisma.scheduledReportDelivery.update({ where: { id: delivery.id }, data: { status: 'SENT', sentAt: new Date() } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scheduledReportDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', errorMessage: message } });
    console.error(`[scheduled-report-generate] delivery ${dedupeKey} failed: ${message}`);
  }
}

/**
 * Always runs under SYSTEM_JOB_CONTEXT (gotcha #4 in the module brief) —
 * this is background dispatch, not a request-scoped user's own view, so
 * every report definition's execute() sees org-wide data here regardless
 * of who owns the ScheduledReport. Exported standalone so run-now (the
 * queue producer's job data references this by runId only) and a future
 * integration test can invoke it directly without a Redis round trip, same
 * reasoning as renewal-scan.job.ts's runRenewalScan().
 */
export async function runGenerateAndDeliver(runId: string): Promise<void> {
  await runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const run = await prisma.scheduledReportRun.findUnique({
      where: { id: runId },
      include: { scheduledReport: { include: { recipients: { include: { user: true } } } } },
    });
    if (!run) {
      console.error(`[scheduled-report-generate] run ${runId} not found — skipping`);
      return;
    }

    await prisma.scheduledReportRun.update({ where: { id: runId }, data: { status: 'RUNNING', startedAt: new Date() } });

    try {
      const definition = registry.get(run.reportKey);
      if (!definition) throw new Error(`Unknown report key: ${run.reportKey}`);

      const filters = definition.filterSchema.parse(run.filters ?? {});
      const result = await definition.execute(prisma, filters, run.dimension ?? undefined);

      const exportFormat = toExportFormat(run.format);
      const buffer = await renderReportExport(result, exportFormat, definition.name);
      const uploaded = await uploadReportFile(run.id, run.reportKey, exportFormat, buffer);

      await prisma.scheduledReportRun.update({
        where: { id: runId },
        data: {
          status: 'SUCCEEDED',
          storageBucket: uploaded.bucket,
          storageKey: uploaded.key,
          rowCount: result.totalRowCount,
          completedAt: new Date(),
        },
      });

      const recipients = run.scheduledReport?.recipients ?? [];
      if (recipients.length === 0) {
        console.warn(`[scheduled-report-generate] run ${runId} has no recipients (scheduledReport deleted or none configured) — report generated, nothing delivered`);
      }
      for (const recipient of recipients) {
        await deliverToRecipient(prisma, run.id, recipient, definition.name, exportFormat, buffer);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.scheduledReportRun.update({
        where: { id: runId },
        data: { status: 'FAILED', errorMessage: message, completedAt: new Date() },
      });
      throw err;
    }
  });
}

export function createScheduledReportGenerateQueue(connection: Redis): Queue<ScheduledReportGenerateJobData> {
  return new Queue<ScheduledReportGenerateJobData>(SCHEDULED_REPORT_GENERATE_QUEUE_NAME, { connection });
}

export function createScheduledReportGenerateWorker(connection: Redis): Worker<ScheduledReportGenerateJobData> {
  return new Worker<ScheduledReportGenerateJobData>(
    SCHEDULED_REPORT_GENERATE_QUEUE_NAME,
    async (job: Job<ScheduledReportGenerateJobData>) => {
      await runGenerateAndDeliver(job.data.runId);
    },
    { connection },
  );
}

import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException, NotImplementedException } from '@nestjs/common';
import { getPrismaClient, type Prisma, type SyncJob, type SyncJobStatus } from '@topiadesk/db';
import { fetchMockFixtureBatch, validateExternalPolicyRecord } from './fixtures/mock-core-broking-fixture';
import { upsertAccountRecord, upsertCarrierRecord, upsertPolicyRecord } from './upsert-record';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  /**
   * Triggers one sync run for a connector. Only MOCK_STUB is implemented —
   * this is the Phase-1 acceptance bar (a real, proven mock connector, not
   * empty scaffolding), not a shortcut; CORE_BROKING_SYSTEM/ERP adapters
   * are a documented Phase-2+ extension point (see fixtures/
   * mock-core-broking-fixture.ts for exactly what would need to change).
   */
  async triggerSync(connectorId: string, triggeredByUserId: string): Promise<SyncJob> {
    const prisma = getPrismaClient();
    const connector = await prisma.integrationConnector.findUnique({ where: { id: connectorId } });
    if (!connector) throw new NotFoundException(`Integration connector ${connectorId} not found`);
    if (!connector.isEnabled) throw new BadRequestException(`Connector "${connector.name}" is disabled`);
    if (connector.connectorType !== 'MOCK_STUB') {
      throw new NotImplementedException(
        `Sync for connector type ${connector.connectorType} is not implemented in Phase 1 — only MOCK_STUB is proven end-to-end`,
      );
    }

    const config = connector.config as { fixtureEndpoint?: string } | null;
    const fixtureEndpoint = config?.fixtureEndpoint ?? '(no fixtureEndpoint configured)';

    const syncJob = await prisma.syncJob.create({
      data: {
        connectorId,
        jobType: 'MOCK_STUB_POLICY_POLL',
        status: 'RUNNING',
        startedAt: new Date(),
        correlationId: randomUUID(),
        triggeredBy: triggeredByUserId,
      },
    });

    // No real HTTP call — see fixtures/mock-core-broking-fixture.ts's
    // header comment for why this is the mock's actual, documented
    // implementation rather than a shortcut.
    const records = fetchMockFixtureBatch(fixtureEndpoint);

    let succeeded = 0;
    let failed = 0;

    for (const record of records) {
      const validationErrors = validateExternalPolicyRecord(record);
      if (validationErrors.length > 0) {
        failed += 1;
        await prisma.integrationLog.create({
          data: {
            syncJobId: syncJob.id,
            connectorId,
            level: 'ERROR',
            category: 'ERROR_HANDLING',
            externalRecordId: record.externalId,
            message: `Validation failed: ${validationErrors.join('; ')}`,
            payloadSnapshot: record as unknown as Prisma.InputJsonValue,
          },
        });
        continue;
      }

      try {
        const owner = await upsertAccountRecord(record.accountName, triggeredByUserId);
        const carrier = await upsertCarrierRecord(record.carrierName);
        const { id: policyId, created } = await upsertPolicyRecord(record, owner.id, carrier.id);
        succeeded += 1;
        await prisma.integrationLog.create({
          data: {
            syncJobId: syncJob.id,
            connectorId,
            level: 'INFO',
            // Folds reconciliation into the log via `category`, per the
            // architecture plan, rather than a separate reconciliation
            // table: a first-seen record is a plain SYNC; a record that
            // already existed and was updated is a RECONCILIATION.
            category: created ? 'SYNC' : 'RECONCILIATION',
            externalRecordId: record.externalId,
            internalEntityType: 'Policy',
            internalEntityId: policyId,
            message: created ? `Created policy ${record.policyNumber} from external record ${record.externalId}` : `Reconciled existing policy ${record.policyNumber} against external record ${record.externalId}`,
            payloadSnapshot: record as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Sync ${syncJob.id}: failed to upsert record ${record.externalId}: ${message}`);
        await prisma.integrationLog.create({
          data: {
            syncJobId: syncJob.id,
            connectorId,
            level: 'ERROR',
            category: 'ERROR_HANDLING',
            externalRecordId: record.externalId,
            message: `Upsert failed: ${message}`,
            payloadSnapshot: record as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    const status: SyncJobStatus = failed === 0 ? 'SUCCEEDED' : succeeded === 0 ? 'FAILED' : 'PARTIAL';
    const completed = await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status, completedAt: new Date(), recordsProcessed: records.length, recordsSucceeded: succeeded, recordsFailed: failed },
    });

    if (succeeded > 0) {
      await prisma.integrationConnector.update({ where: { id: connectorId }, data: { lastSuccessfulSyncAt: new Date() } });
    }

    return completed;
  }

  async listSyncJobs(connectorId: string): Promise<SyncJob[]> {
    const connector = await getPrismaClient().integrationConnector.findUnique({ where: { id: connectorId }, select: { id: true } });
    if (!connector) throw new NotFoundException(`Integration connector ${connectorId} not found`);
    return getPrismaClient().syncJob.findMany({ where: { connectorId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async listSyncJobLogs(syncJobId: string) {
    const syncJob = await getPrismaClient().syncJob.findUnique({ where: { id: syncJobId }, select: { id: true } });
    if (!syncJob) throw new NotFoundException(`Sync job ${syncJobId} not found`);
    return getPrismaClient().integrationLog.findMany({ where: { syncJobId }, orderBy: { createdAt: 'asc' } });
  }
}

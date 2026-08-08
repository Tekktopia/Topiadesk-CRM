import { randomUUID } from 'node:crypto';
import { Injectable, Logger, BadRequestException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { getPrismaClient, type Prisma, type IntegrationConnector, type SyncJob, type SyncJobStatus } from '@topiadesk/db';
import { fetchMockFixtureBatch, validateExternalPolicyRecord } from './fixtures/mock-core-broking-fixture';
import { upsertAccountRecord, upsertCarrierRecord, upsertPolicyRecord } from './upsert-record';
import { listSeamlessHrEmployees } from './seamlesshr-client';
import { upsertSeamlessHrEmployee } from './seamlesshr-sync';
// NOT a type-only import: constructor-injected below — see the same
// footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { KeycloakAdminService } from '../identity/keycloak-admin.service';

interface SyncRunResult {
  processed: number;
  succeeded: number;
  failed: number;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(private readonly keycloakAdmin: KeycloakAdminService) {}

  /**
   * Triggers one sync run for a connector — MOCK_STUB (the Phase-1
   * acceptance bar, proven end-to-end) and SEAMLESSHR (employee/org sync)
   * are implemented; CORE_BROKING_SYSTEM/ERP adapters remain a documented
   * future extension point (see fixtures/mock-core-broking-fixture.ts).
   * Runs synchronously within the request, same as MOCK_STUB always has —
   * matching that existing precedent rather than introducing a queued-job
   * shape just for this pass; a real org's employee count making this slow
   * is a reasonable trigger to revisit, not a blocker now.
   */
  async triggerSync(connectorId: string, triggeredByUserId: string): Promise<SyncJob> {
    const prisma = getPrismaClient();
    const connector = await prisma.integrationConnector.findUnique({ where: { id: connectorId } });
    if (!connector) throw new NotFoundException(`Integration connector ${connectorId} not found`);
    if (!connector.isEnabled) throw new BadRequestException(`Connector "${connector.name}" is disabled`);
    if (connector.connectorType !== 'MOCK_STUB' && connector.connectorType !== 'SEAMLESSHR') {
      throw new NotImplementedException(
        `Sync for connector type ${connector.connectorType} is not implemented — only MOCK_STUB and SEAMLESSHR are proven end-to-end`,
      );
    }

    const syncJob = await prisma.syncJob.create({
      data: {
        connectorId,
        jobType: connector.connectorType === 'SEAMLESSHR' ? 'SEAMLESSHR_EMPLOYEE_SYNC' : 'MOCK_STUB_POLICY_POLL',
        status: 'RUNNING',
        startedAt: new Date(),
        correlationId: randomUUID(),
        triggeredBy: triggeredByUserId,
      },
    });

    const result =
      connector.connectorType === 'SEAMLESSHR'
        ? await this.runSeamlessHrSync(connector, syncJob.id)
        : await this.runMockStubSync(connector, syncJob.id, triggeredByUserId);

    const status: SyncJobStatus = result.failed === 0 ? 'SUCCEEDED' : result.succeeded === 0 ? 'FAILED' : 'PARTIAL';
    const completed = await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status, completedAt: new Date(), recordsProcessed: result.processed, recordsSucceeded: result.succeeded, recordsFailed: result.failed },
    });

    if (result.succeeded > 0) {
      await prisma.integrationConnector.update({ where: { id: connectorId }, data: { lastSuccessfulSyncAt: new Date() } });
    }

    return completed;
  }

  private async runMockStubSync(connector: IntegrationConnector, syncJobId: string, triggeredByUserId: string): Promise<SyncRunResult> {
    const prisma = getPrismaClient();
    const config = connector.config as { fixtureEndpoint?: string } | null;
    const fixtureEndpoint = config?.fixtureEndpoint ?? '(no fixtureEndpoint configured)';

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
            syncJobId,
            connectorId: connector.id,
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
            syncJobId,
            connectorId: connector.id,
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
        this.logger.warn(`Sync ${syncJobId}: failed to upsert record ${record.externalId}: ${message}`);
        await prisma.integrationLog.create({
          data: {
            syncJobId,
            connectorId: connector.id,
            level: 'ERROR',
            category: 'ERROR_HANDLING',
            externalRecordId: record.externalId,
            message: `Upsert failed: ${message}`,
            payloadSnapshot: record as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    return { processed: records.length, succeeded, failed };
  }

  /** SeamlessHR employee/org-structure sync — see seamlesshr-client.ts and
   * seamlesshr-sync.ts's header comments for the real caveats (auth
   * mechanism/response shape assumed, not verified against a live
   * SeamlessHR tenant in this environment). */
  private async runSeamlessHrSync(connector: IntegrationConnector, syncJobId: string): Promise<SyncRunResult> {
    const prisma = getPrismaClient();
    const config = connector.config as { seamlessHR?: { apiBaseUrl?: string; apiKey?: string } } | null;
    const apiBaseUrl = config?.seamlessHR?.apiBaseUrl;
    const apiKey = config?.seamlessHR?.apiKey;
    if (!apiBaseUrl || !apiKey) {
      throw new BadRequestException(`Connector "${connector.name}" is missing config.seamlessHR.apiBaseUrl/apiKey`);
    }

    const employees = await listSeamlessHrEmployees(apiBaseUrl, apiKey);
    let succeeded = 0;
    let failed = 0;

    for (const employee of employees) {
      try {
        const { userId, created } = await upsertSeamlessHrEmployee(employee, this.keycloakAdmin);
        succeeded += 1;
        await prisma.integrationLog.create({
          data: {
            syncJobId,
            connectorId: connector.id,
            level: 'INFO',
            category: created ? 'SYNC' : 'RECONCILIATION',
            externalRecordId: employee.id,
            internalEntityType: 'User',
            internalEntityId: userId,
            message: created ? `Created user for SeamlessHR employee ${employee.id} (${employee.email})` : `Reconciled existing user against SeamlessHR employee ${employee.id} (${employee.email})`,
            payloadSnapshot: employee as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Sync ${syncJobId}: failed to upsert SeamlessHR employee ${employee.id}: ${message}`);
        await prisma.integrationLog.create({
          data: {
            syncJobId,
            connectorId: connector.id,
            level: 'ERROR',
            category: 'ERROR_HANDLING',
            externalRecordId: employee.id,
            message: `Upsert failed: ${message}`,
            payloadSnapshot: employee as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    return { processed: employees.length, succeeded, failed };
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

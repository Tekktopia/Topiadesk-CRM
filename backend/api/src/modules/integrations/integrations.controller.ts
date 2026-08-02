import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT a type-only import: IntegrationsService is constructor-injected below
// — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IntegrationsService } from './integrations.service';
import { ConnectorResponseDto } from './dto/connector-response.dto';
import { SyncJobResponseDto } from './dto/sync-job-response.dto';
import { IntegrationLogResponseDto } from './dto/integration-log-response.dto';

/**
 * Batch 1 Agent D — backend/api/src/modules/integrations/: the connector
 * framework, the MOCK_STUB Core Broking System adapter proven end-to-end
 * (real SyncJob/IntegrationLog rows, deliberate bad-record cases).
 * Technical/admin-only surface — matches prisma/rls/002_policies.sql's
 * integration_connectors_rw/sync_jobs_rw/integration_logs_rw (ALL scope or
 * SYSTEM_JOB), so every route here requires an explicit 'integration'
 * grant.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('connectors')
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: [ConnectorResponseDto] })
  async list(): Promise<ConnectorResponseDto[]> {
    return getPrismaClient().integrationConnector.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('connectors/:id/sync')
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: SyncJobResponseDto })
  async triggerSync(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<SyncJobResponseDto> {
    return this.integrations.triggerSync(id, user.id);
  }

  @Get('connectors/:id/sync-jobs')
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: [SyncJobResponseDto] })
  async listSyncJobs(@Param('id') id: string): Promise<SyncJobResponseDto[]> {
    return this.integrations.listSyncJobs(id);
  }

  @Get('sync-jobs/:id/logs')
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: [IntegrationLogResponseDto] })
  async listSyncJobLogs(@Param('id') id: string): Promise<IntegrationLogResponseDto[]> {
    return this.integrations.listSyncJobLogs(id);
  }
}

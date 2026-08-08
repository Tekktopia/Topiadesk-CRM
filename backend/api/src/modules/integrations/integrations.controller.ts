import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma, type IntegrationConnector } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT a type-only import: IntegrationsService is constructor-injected below
// — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IntegrationsService } from './integrations.service';
import { ConnectorResponseDto } from './dto/connector-response.dto';
import { CreateConnectorDto, UpdateConnectorDto } from './dto/connector-write.dto';
import { SyncJobResponseDto } from './dto/sync-job-response.dto';
import { IntegrationLogResponseDto } from './dto/integration-log-response.dto';
import { deepMergeConfig, redactConnectorConfig } from './redact-connector-config';

function toConnectorResponse(connector: IntegrationConnector): ConnectorResponseDto {
  return { ...connector, config: redactConnectorConfig(connector.config) as Record<string, unknown> };
}

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
    const connectors = await getPrismaClient().integrationConnector.findMany({ orderBy: { name: 'asc' } });
    return connectors.map(toConnectorResponse);
  }

  @Post('connectors')
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: ConnectorResponseDto })
  async create(@Body() dto: CreateConnectorDto): Promise<ConnectorResponseDto> {
    const connector = await getPrismaClient().integrationConnector.create({
      data: {
        name: dto.name,
        connectorType: dto.connectorType,
        syncDirection: dto.syncDirection,
        isEnabled: dto.isEnabled ?? true,
        pollingIntervalMinutes: dto.pollingIntervalMinutes,
        webhookPath: dto.webhookPath,
        config: dto.config as Prisma.InputJsonValue,
      },
    });
    return toConnectorResponse(connector);
  }

  @Patch('connectors/:id')
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: ConnectorResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateConnectorDto): Promise<ConnectorResponseDto> {
    const existing = await getPrismaClient().integrationConnector.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Integration connector ${id} not found`);
    // Shallow merge, not a full replace, unlike most other Json-column
    // PATCHes in this codebase (e.g. AutomationRule.conditions/steps) —
    // deliberate here specifically because GET redacts secret-shaped
    // config keys (redactConnectorConfig) before ever returning them, so
    // the edit UI can never legitimately resend an unchanged secret's real
    // value. A merge means "leave this field untouched" (omit it from the
    // PATCH body) actually preserves the existing stored secret instead of
    // silently wiping it via a naive full-object overwrite.
    const mergedConfig = dto.config ? deepMergeConfig(existing.config, dto.config) : undefined;
    const connector = await getPrismaClient().integrationConnector.update({
      where: { id },
      data: {
        name: dto.name,
        connectorType: dto.connectorType,
        syncDirection: dto.syncDirection,
        isEnabled: dto.isEnabled,
        pollingIntervalMinutes: dto.pollingIntervalMinutes,
        webhookPath: dto.webhookPath,
        config: mergedConfig as Prisma.InputJsonValue | undefined,
      },
    });
    return toConnectorResponse(connector);
  }

  @Delete('connectors/:id')
  @RequirePermission('integration', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const existing = await getPrismaClient().integrationConnector.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Integration connector ${id} not found`);
    await getPrismaClient().integrationConnector.delete({ where: { id } });
    return { deleted: true };
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

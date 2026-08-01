import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { ConnectorResponseDto } from './dto/connector-response.dto';

/**
 * Foundation stub. Batch 1 Agent D owns apps/api/src/modules/integrations/:
 * the connector framework, the MOCK_STUB Core Broking System adapter proven
 * end-to-end (real SyncJob/IntegrationLog rows, deliberate bad-record
 * cases), webhook receivers.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('integrations/connectors')
export class IntegrationsController {
  @Get()
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: [ConnectorResponseDto] })
  async list(): Promise<ConnectorResponseDto[]> {
    return getPrismaClient().integrationConnector.findMany({ orderBy: { name: 'asc' } });
  }
}

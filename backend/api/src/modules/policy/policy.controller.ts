import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { PolicyResponseDto } from './dto/policy-response.dto';

/**
 * Foundation stub. Batch 1 Agent C owns backend/api/src/modules/policy/ (Policy/
 * PolicyVersion/Premium/RenewalSchedule CRUD, endorsement workflow) AND
 * backend/worker/src/jobs/renewal-alerts/ (the T-90/60/30/7 day scan job) —
 * kept as one agent since the business rules are tightly coupled.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies')
export class PolicyController {
  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PolicyResponseDto] })
  async list(): Promise<PolicyResponseDto[]> {
    return getPrismaClient().policy.findMany({ orderBy: { expiryDate: 'asc' }, take: 50 });
  }
}

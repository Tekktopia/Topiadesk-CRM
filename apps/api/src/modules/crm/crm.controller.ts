import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AccountResponseDto } from './dto/account-response.dto';

/**
 * Foundation stub — a single real, RLS-scoped list endpoint proving the
 * pattern (guard -> RLS-filtered Prisma query -> typed response). Batch 1
 * Agent B owns apps/api/src/modules/crm/: Account/Contact/Carrier/
 * AccountRelationship/Lead/Opportunity/Pipeline/OpportunityMarketSubmission/
 * Activity/Task CRUD, lead scoring, pipeline stage transitions.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/accounts')
export class CrmController {
  @Get()
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [AccountResponseDto] })
  async list(): Promise<AccountResponseDto[]> {
    // RLS (prisma/rls/002_policies.sql) restricts this to whatever scope
    // the current session's permission grants allow — no manual WHERE
    // clause needed here for scoping.
    return getPrismaClient().account.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }
}

import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Policy } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PolicyResponseDto } from './dto/policy-response.dto';
import { assertValidPolicyTransition } from './policy-lifecycle';
import { decimalToString } from './decimal.util';

function toPolicyDto(policy: Policy): PolicyResponseDto {
  return { ...policy, sumInsured: decimalToString(policy.sumInsured) };
}

/**
 * Policy CRUD + lifecycle status transitions. See
 * policy-version.controller.ts for endorsement/renewal/cancellation
 * versioning (and the maker-checker Approval gate), premium.controller.ts,
 * renewal-schedule.controller.ts. All access goes through
 * `getPrismaClient()` inside the RLS context bound by
 * RlsContextMiddleware — Policy visibility is scoped via the linked
 * Account's owner (prisma/rls/002_policies.sql's policies_rw); no manual
 * WHERE filtering here.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies')
export class PolicyController {
  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PolicyResponseDto] })
  async list(@Query('status') status?: string, @Query('accountId') accountId?: string): Promise<PolicyResponseDto[]> {
    const policies = await getPrismaClient().policy.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(accountId ? { accountId } : {}),
      },
      orderBy: { expiryDate: 'asc' },
      take: 100,
    });
    return policies.map(toPolicyDto);
  }

  @Get(':id')
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: PolicyResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PolicyResponseDto> {
    // Related version history / renewal schedule are their own resources
    // (GET .../versions, GET .../renewal-schedule) rather than embedded
    // here — keeps this response's shape stable regardless of how deep
    // those relations grow.
    const policy = await getPrismaClient().policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');
    return toPolicyDto(policy);
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyResponseDto })
  async create(@Body() dto: CreatePolicyDto): Promise<PolicyResponseDto> {
    const policy = await getPrismaClient().policy.create({
      data: {
        policyNumber: dto.policyNumber,
        accountId: dto.accountId,
        carrierId: dto.carrierId,
        lineOfBusiness: dto.lineOfBusiness,
        sumInsured: dto.sumInsured,
        currency: dto.currency ?? 'NGN',
        inceptionDate: new Date(dto.inceptionDate),
        expiryDate: new Date(dto.expiryDate),
        brokerOfRecordId: dto.brokerOfRecordId,
        // status intentionally omitted — schema default QUOTED. Reaching
        // ISSUED etc. happens via PolicyVersion creation (policy-version.controller.ts).
      },
    });
    return toPolicyDto(policy);
  }

  @Patch(':id')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyResponseDto })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePolicyDto): Promise<PolicyResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.policy.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Policy not found');

    if (dto.status) {
      assertValidPolicyTransition(existing.status, dto.status);
    }

    const policy = await prisma.policy.update({
      where: { id },
      data: {
        lineOfBusiness: dto.lineOfBusiness,
        sumInsured: dto.sumInsured,
        currency: dto.currency,
        inceptionDate: dto.inceptionDate ? new Date(dto.inceptionDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        brokerOfRecordId: dto.brokerOfRecordId,
        status: dto.status,
      },
    });
    return toPolicyDto(policy);
  }
}

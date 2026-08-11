import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma, type CaseManagementEntityType } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { ACTION_FIELDS, CONDITION_FIELDS } from './business-rules.validator';
import { BusinessRuleQueryDto, BusinessRuleResponseDto, CreateBusinessRuleDto, UpdateBusinessRuleDto } from './dto/business-rule.dto';

/**
 * business_rules has no RLS (prisma/rls/001_enable_rls.sql omits it —
 * same open-config tier as custom_field_definitions/case_categories), so
 * reads are ungated (authentication alone suffices) — every Case-form user
 * needs to fetch active rules regardless of role. Writes get their own
 * dedicated 'business_rule' resource rather than reusing 'case' — see
 * packages/db/src/seed/baseline.ts's comment on why this deviates from
 * case_categories' reuse-'case' convention (blast radius: a rule reshapes
 * every user's form, not just adds a lookup value), which is why it's
 * granted to ADMIN only.
 */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('business-rules')
export class BusinessRulesController {
  @Get()
  @ApiOkResponse({ type: [BusinessRuleResponseDto] })
  async list(@Query() query: BusinessRuleQueryDto): Promise<BusinessRuleResponseDto[]> {
    return getPrismaClient().businessRule.findMany({
      where: query.entityType ? { entityType: query.entityType } : undefined,
      orderBy: { displayOrder: 'asc' },
    });
  }

  @Get(':id')
  @ApiOkResponse({ type: BusinessRuleResponseDto })
  async getOne(@Param('id') id: string): Promise<BusinessRuleResponseDto> {
    const rule = await getPrismaClient().businessRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('BusinessRule not found');
    return rule;
  }

  @Post()
  @RequirePermission('business_rule', 'write')
  @ApiOkResponse({ type: BusinessRuleResponseDto })
  async create(@Body() dto: CreateBusinessRuleDto): Promise<BusinessRuleResponseDto> {
    assertFieldsAllowed(dto.entityType, dto.conditionField, dto.actions);
    return getPrismaClient().businessRule.create({
      data: {
        entityType: dto.entityType,
        name: dto.name,
        description: dto.description,
        conditionField: dto.conditionField,
        conditionOperator: dto.conditionOperator,
        conditionValue: dto.conditionValue,
        actions: dto.actions as unknown as Prisma.InputJsonValue,
        isActive: dto.isActive,
        displayOrder: dto.displayOrder,
      },
    });
  }

  @Patch(':id')
  @RequirePermission('business_rule', 'write')
  @ApiOkResponse({ type: BusinessRuleResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateBusinessRuleDto): Promise<BusinessRuleResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.businessRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('BusinessRule not found');
    assertFieldsAllowed(existing.entityType, dto.conditionField ?? existing.conditionField, dto.actions ?? (existing.actions as never));
    return prisma.businessRule.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        conditionField: dto.conditionField,
        conditionOperator: dto.conditionOperator,
        conditionValue: dto.conditionValue,
        actions: dto.actions as unknown as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive,
        displayOrder: dto.displayOrder,
      },
    });
  }

  @Delete(':id')
  @RequirePermission('business_rule', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.businessRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('BusinessRule not found');
    // Hard delete is fine here, unlike CustomFieldDefinition — nothing on
    // Case/Claim rows references a BusinessRule id, so there's no jsonb
    // value orphaning risk to guard against with a soft-delete flag.
    await prisma.businessRule.delete({ where: { id } });
    return { deleted: true };
  }
}

function assertFieldsAllowed(
  entityType: CaseManagementEntityType,
  conditionField: string,
  actions: Array<{ field: string }>,
): void {
  if (!CONDITION_FIELDS[entityType].includes(conditionField)) {
    throw new BadRequestException(`"${conditionField}" is not a valid condition field for ${entityType}`);
  }
  for (const action of actions) {
    if (!ACTION_FIELDS[entityType].includes(action.field)) {
      throw new BadRequestException(`"${action.field}" is not a valid action field for ${entityType}`);
    }
  }
}

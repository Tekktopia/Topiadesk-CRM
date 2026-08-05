import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  CreateCustomFieldDefinitionDto,
  CustomFieldDefinitionQueryDto,
  CustomFieldDefinitionResponseDto,
  UpdateCustomFieldDefinitionDto,
} from './dto/custom-field-definition.dto';

/**
 * custom_field_definitions carries no RLS (org-wide config, same tier as
 * Carrier/Pipeline — see schema.prisma) — reads are ungated, writes are
 * gated on 'account' since no dedicated 'custom_field_definition' permission
 * resource is seeded (mirrors carriers.controller.ts / pipelines.controller.ts).
 *
 * DELETE soft-deletes (isActive=false) — never a hard delete, which would
 * orphan jsonb values already written under this key on live Account/
 * Contact/Lead/Opportunity rows.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/custom-field-definitions')
export class CustomFieldDefinitionsController {
  @Get()
  @ApiOkResponse({ type: [CustomFieldDefinitionResponseDto] })
  async list(@Query() query: CustomFieldDefinitionQueryDto): Promise<CustomFieldDefinitionResponseDto[]> {
    return getPrismaClient().customFieldDefinition.findMany({
      where: { entityType: query.entityType },
      orderBy: [{ entityType: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  @Get(':id')
  @ApiOkResponse({ type: CustomFieldDefinitionResponseDto })
  async getOne(@Param('id') id: string): Promise<CustomFieldDefinitionResponseDto> {
    const definition = await getPrismaClient().customFieldDefinition.findUnique({ where: { id } });
    if (!definition) throw new NotFoundException('CustomFieldDefinition not found');
    return definition;
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: CustomFieldDefinitionResponseDto })
  async create(@Body() dto: CreateCustomFieldDefinitionDto): Promise<CustomFieldDefinitionResponseDto> {
    return getPrismaClient().customFieldDefinition.create({ data: dto });
  }

  @Patch(':id')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: CustomFieldDefinitionResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCustomFieldDefinitionDto): Promise<CustomFieldDefinitionResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('CustomFieldDefinition not found');
    return prisma.customFieldDefinition.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermission('account', 'write')
  async remove(@Param('id') id: string): Promise<{ deactivated: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('CustomFieldDefinition not found');
    await prisma.customFieldDefinition.update({ where: { id }, data: { isActive: false } });
    return { deactivated: true };
  }
}

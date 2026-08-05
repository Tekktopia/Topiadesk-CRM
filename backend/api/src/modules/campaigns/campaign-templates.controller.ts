import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, getRlsContext } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CampaignTemplateResponseDto, CreateCampaignTemplateDto, MergeFieldDescriptorResponseDto, UpdateCampaignTemplateDto } from './dto/campaign-template.dto';
import { CAMPAIGN_MERGE_FIELD_KEYS, CAMPAIGN_MERGE_FIELDS } from './merge-fields';

function validateMergeFields(mergeFields: string[] | undefined): void {
  const unknown = (mergeFields ?? []).filter((f) => !CAMPAIGN_MERGE_FIELD_KEYS.includes(f));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown merge field(s): ${unknown.join(', ')} — see GET /campaign-templates/merge-fields for the allowlist`);
  }
}

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('campaign-templates')
export class CampaignTemplatesController {
  /**
   * Fixed, hardcoded allow-list — declared as a route ahead of `:id`-style
   * paths would be if any existed here (none do on this controller today,
   * kept as a static segment regardless for future-proofing) so `/merge-fields`
   * can never be swallowed by a wildcard id param.
   */
  @Get('merge-fields')
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: [MergeFieldDescriptorResponseDto] })
  getMergeFields(): MergeFieldDescriptorResponseDto[] {
    return [...CAMPAIGN_MERGE_FIELDS];
  }

  @Get()
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: [CampaignTemplateResponseDto] })
  async list(): Promise<CampaignTemplateResponseDto[]> {
    return getPrismaClient().campaignTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: CampaignTemplateResponseDto })
  async getOne(@Param('id') id: string): Promise<CampaignTemplateResponseDto> {
    const template = await getPrismaClient().campaignTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Campaign template not found');
    return template;
  }

  @Post()
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: CampaignTemplateResponseDto })
  async create(@Body() dto: CreateCampaignTemplateDto): Promise<CampaignTemplateResponseDto> {
    validateMergeFields(dto.mergeFields);
    const ctx = getRlsContext();
    if (!ctx) throw new Error('create() called outside an RLS context — RlsContextMiddleware should have bound one');

    return getPrismaClient().campaignTemplate.create({
      data: {
        name: dto.name,
        channel: dto.channel,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
        mergeFields: dto.mergeFields ?? [],
        whatsappTemplateName: dto.whatsappTemplateName,
        whatsappTemplateLang: dto.whatsappTemplateLang,
        isActive: dto.isActive ?? true,
        createdById: ctx.userId,
      },
    });
  }

  @Patch(':id')
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: CampaignTemplateResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCampaignTemplateDto): Promise<CampaignTemplateResponseDto> {
    validateMergeFields(dto.mergeFields);
    const prisma = getPrismaClient();
    const existing = await prisma.campaignTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign template not found');
    return prisma.campaignTemplate.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermission('campaign', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.campaignTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign template not found');
    await prisma.campaignTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}

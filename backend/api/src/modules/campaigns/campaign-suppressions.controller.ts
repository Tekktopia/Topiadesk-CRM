import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CampaignSuppressionQueryDto, CampaignSuppressionResponseDto } from './dto/campaign-suppression.dto';

/**
 * Read-only, deliberately — see suppressions-list-view.tsx's header
 * comment on the frontend for the full context this closes: enforcement
 * (public-unsubscribe.controller.ts, campaign-webhooks.controller.ts) was
 * always real, but there was no authenticated way to actually see who's
 * suppressed and why. No POST/DELETE here on purpose: suppression rows are
 * only ever created by the two system writers above (explicit opt-out or a
 * bounce/complaint), and for NDPR/compliance reasons a staff member should
 * not be able to silently un-suppress someone who opted out — that's a
 * genuine one-way door, not an oversight.
 */
@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('campaign-suppressions')
export class CampaignSuppressionsController {
  @Get()
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: [CampaignSuppressionResponseDto] })
  async list(@Query() query: CampaignSuppressionQueryDto): Promise<CampaignSuppressionResponseDto[]> {
    return getPrismaClient().campaignSuppression.findMany({
      where: {
        channel: query.channel,
        emailOrPhone: query.search ? { contains: query.search, mode: 'insensitive' } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 200,
      skip: query.skip,
    });
  }
}

import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type WebhookEventType } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  CreateWebhookSubscriptionDto,
  UpdateWebhookSubscriptionDto,
  WebhookDeliveryResponseDto,
  WebhookSubscriptionCreatedResponseDto,
  WebhookSubscriptionResponseDto,
} from './dto/webhook-subscription.dto';
import { generateWebhookSigningSecret } from './webhook-signing.util';

/**
 * Outbound webhook subscription management. Same 'integration' resource
 * gate as the rest of this module (webhook_subscriptions_rw/
 * webhook_deliveries_rw both require ALL-scope 'integration' or
 * SYSTEM_JOB — prisma/rls/002_policies.sql). Actual delivery is a separate
 * concern entirely: backend/worker/src/jobs/webhooks/dispatch.job.ts polls
 * audit_log and enqueues WebhookDelivery rows + BullMQ jobs — this
 * controller only manages subscriptions and lets an admin inspect/redeliver
 * what the worker already attempted.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('integrations/webhook-subscriptions')
export class WebhookSubscriptionsController {
  @Get()
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: [WebhookSubscriptionResponseDto] })
  async list(): Promise<WebhookSubscriptionResponseDto[]> {
    return getPrismaClient().webhookSubscription.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: WebhookSubscriptionResponseDto })
  async get(@Param('id') id: string): Promise<WebhookSubscriptionResponseDto> {
    const sub = await getPrismaClient().webhookSubscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('Webhook subscription not found');
    return sub;
  }

  @Post()
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: WebhookSubscriptionCreatedResponseDto })
  async create(@Body() dto: CreateWebhookSubscriptionDto, @CurrentUser() user: AuthenticatedUser): Promise<WebhookSubscriptionCreatedResponseDto> {
    const signingSecret = generateWebhookSigningSecret();
    const created = await getPrismaClient().webhookSubscription.create({
      data: {
        name: dto.name,
        targetUrl: dto.targetUrl,
        eventTypes: dto.eventTypes as WebhookEventType[],
        signingSecret,
        createdById: user.id,
      },
    });
    return { ...created, signingSecret };
  }

  @Patch(':id')
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: WebhookSubscriptionResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateWebhookSubscriptionDto): Promise<WebhookSubscriptionResponseDto> {
    const existing = await getPrismaClient().webhookSubscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Webhook subscription not found');
    return getPrismaClient().webhookSubscription.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.targetUrl !== undefined && { targetUrl: dto.targetUrl }),
        ...(dto.eventTypes !== undefined && { eventTypes: dto.eventTypes as WebhookEventType[] }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  @Delete(':id')
  @RequirePermission('integration', 'write')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    const existing = await getPrismaClient().webhookSubscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Webhook subscription not found');
    await getPrismaClient().webhookSubscription.delete({ where: { id } });
  }

  @Get(':id/deliveries')
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: [WebhookDeliveryResponseDto] })
  async listDeliveries(@Param('id') id: string): Promise<WebhookDeliveryResponseDto[]> {
    const sub = await getPrismaClient().webhookSubscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('Webhook subscription not found');
    return getPrismaClient().webhookDelivery.findMany({ where: { subscriptionId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /**
   * Resets attemptCount/status back to PENDING so dispatch.job.ts's worker
   * picks it back up on its next poll — deliberately doesn't POST directly
   * from the API process; the worker is the one place that owns retry/
   * backoff bookkeeping (BullMQ), redelivery just re-queues through that
   * same path instead of a second delivery code path.
   */
  @Post(':id/deliveries/:deliveryId/redeliver')
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: WebhookDeliveryResponseDto })
  async redeliver(@Param('id') id: string, @Param('deliveryId') deliveryId: string): Promise<WebhookDeliveryResponseDto> {
    const delivery = await getPrismaClient().webhookDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery || delivery.subscriptionId !== id) throw new NotFoundException('Webhook delivery not found');
    if (delivery.status === 'PENDING') throw new ConflictException('Delivery is already pending');
    return getPrismaClient().webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'PENDING', attemptCount: 0, nextAttemptAt: new Date() },
    });
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { loadEnv } from '@topiadesk/config';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { ensureCaseSlaClocks } from '../case-management/sla-clock.util';
import { enqueueEntityEvent } from '../case-management/automation-events.util';
import { LiveChatMessageDto, LiveChatSessionResponseDto, PostLiveChatMessageDto, StartLiveChatSessionDto } from './dto/live-chat.dto';
import { findOpenCaseByChannelDetail, generateCaseNumber } from './omnichannel.util';

function signCaseId(caseId: string): string {
  const { OMNICHANNEL_WEBHOOK_SECRET } = loadEnv();
  return createHmac('sha256', OMNICHANNEL_WEBHOOK_SECRET).update(caseId).digest('hex');
}

function assertValidSessionToken(caseId: string, sessionToken: string | undefined): void {
  const expected = signCaseId(caseId);
  if (!sessionToken || sessionToken.length !== expected.length || !timingSafeEqual(Buffer.from(sessionToken), Buffer.from(expected))) {
    throw new ForbiddenException('Invalid session token');
  }
}

/**
 * Fully self-contained live chat widget backend — unlike the inbound
 * email/WhatsApp/SMS webhooks in this module, this channel needs no
 * third-party account to build or test end-to-end: the "provider" is our
 * own frontend widget (frontend/web/app/(dashboard)/widget-demo/). Every
 * write here runs under SYSTEM_JOB_CONTEXT because the caller is an
 * anonymous website visitor, not a TopiaDesk user with a bound RLS
 * session — see cases_rw / activities_rw in prisma/rls/002_policies.sql,
 * both of which explicitly allow app_current_role() = 'SYSTEM_JOB'.
 *
 * These routes are excluded from RlsContextMiddleware in app.module.ts
 * (same reasoning as identity/webhooks/keycloak) and are NOT behind
 * PermissionGuard — there's no AuthenticatedUser to check permissions
 * against. Access control for the message-polling endpoint instead comes
 * from possession of `sessionToken`, an HMAC of the case id keyed by
 * OMNICHANNEL_WEBHOOK_SECRET — cheap, stateless (no new table), and not
 * guessable without the server-side secret, unlike the case id alone.
 */
@ApiTags('omnichannel')
@Controller('public/live-chat')
export class LiveChatController {
  @Post('sessions')
  @ApiOkResponse({ type: LiveChatSessionResponseDto })
  async startSession(@Body() dto: StartLiveChatSessionDto): Promise<LiveChatSessionResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();

      // No Contact is created for an anonymous visitor — Contact requires
      // exactly one of accountId/carrierId (see
      // prisma/rls/003_check_constraints.sql's contacts_exactly_one_parent),
      // which a not-yet-matched web visitor has neither of. Name/email live
      // on the Case subject and the Activity's channelDetail instead, and a
      // returning visitor (same email) is threaded onto their still-open
      // Case rather than starting a new one each time — same correlation
      // pattern as WhatsApp/SMS below.
      const existingCase = await findOpenCaseByChannelDetail(dto.email, 'LIVE_CHAT');
      if (existingCase) {
        await prisma.activity.create({
          data: {
            caseId: existingCase.id,
            type: 'LIVE_CHAT',
            direction: 'INBOUND',
            subject: 'Live chat message',
            body: dto.initialMessage,
            occurredAt: new Date(),
            createdBySystemJob: 'omnichannel-live-chat',
            channelDetail: dto.email,
          },
        });
        return { caseId: existingCase.id, sessionToken: signCaseId(existingCase.id) };
      }

      const kase = await prisma.case.create({
        data: {
          caseNumber: generateCaseNumber(),
          caseType: 'ENQUIRY',
          subject: `Live chat: ${dto.name}`,
          sourceChannel: 'LIVE_CHAT',
        },
      });

      await prisma.activity.create({
        data: {
          caseId: kase.id,
          type: 'LIVE_CHAT',
          direction: 'INBOUND',
          subject: 'Live chat message',
          body: dto.initialMessage,
          occurredAt: new Date(),
          createdBySystemJob: 'omnichannel-live-chat',
          channelDetail: dto.email,
        },
      });

      await ensureCaseSlaClocks(kase.id, null, kase.caseType, kase.priority).catch((err: unknown) => {
        console.error(`[omnichannel] failed to start SLA clocks for case ${kase.id}`, err);
      });
      await enqueueEntityEvent({ entityType: 'CASE', entityId: kase.id, eventType: 'CREATED', occurredAt: kase.createdAt.toISOString() }).catch(() => undefined);

      return { caseId: kase.id, sessionToken: signCaseId(kase.id) };
    });
  }

  @Post('sessions/:caseId/messages')
  @ApiOkResponse({ type: LiveChatMessageDto })
  async postMessage(@Param('caseId') caseId: string, @Body() dto: PostLiveChatMessageDto): Promise<LiveChatMessageDto> {
    assertValidSessionToken(caseId, dto.sessionToken);
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      const kase = await prisma.case.findUnique({ where: { id: caseId } });
      if (!kase) throw new NotFoundException('Chat session not found');

      const activity = await prisma.activity.create({
        data: {
          caseId,
          type: 'LIVE_CHAT',
          direction: 'INBOUND',
          subject: 'Live chat message',
          body: dto.message,
          occurredAt: new Date(),
          createdBySystemJob: 'omnichannel-live-chat',
        },
      });
      return { id: activity.id, direction: activity.direction, body: activity.body, occurredAt: activity.occurredAt, fromAgent: false };
    });
  }

  @Get('sessions/:caseId/messages')
  @ApiOkResponse({ type: [LiveChatMessageDto] })
  async listMessages(@Param('caseId') caseId: string, @Query('sessionToken') sessionToken: string | undefined): Promise<LiveChatMessageDto[]> {
    assertValidSessionToken(caseId, sessionToken);
    if (!sessionToken) throw new BadRequestException('sessionToken is required');
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const activities = await getPrismaClient().activity.findMany({
        where: { caseId, type: 'LIVE_CHAT' },
        orderBy: { occurredAt: 'asc' },
      });
      return activities.map((a) => ({
        id: a.id,
        direction: a.direction,
        body: a.body,
        occurredAt: a.occurredAt,
        // An agent's reply is logged the normal way (comments-section.tsx,
        // reusing CommentsService) with createdById set to a real User —
        // a visitor's own message always comes through this controller's
        // own postMessage(), which never sets createdById.
        fromAgent: a.createdById !== null,
      }));
    });
  }
}

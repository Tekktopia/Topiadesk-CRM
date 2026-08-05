import { BadRequestException, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
// Not type-only: both are runtime-relevant here — UnsubscribeQueryDto is a
// @Query() parameter type (ValidationPipe needs the real class reference)
// and UnsubscribeResponseDto is passed to @ApiOkResponse({ type: ... }).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above
import { UnsubscribeQueryDto, UnsubscribeResponseDto } from './dto/unsubscribe.dto';
import { verifyUnsubscribeToken } from './unsubscribe-token.util';

/**
 * Public, unauthenticated one-click unsubscribe — no bearer token, no
 * shared secret; possession of the signed per-contact-per-channel token
 * (embedded in the campaign send by backend/worker) IS the authorization,
 * same model as any mailing-list unsubscribe link. Excluded from
 * RlsContextMiddleware in app.module.ts (integration pass), so — exactly
 * like identity/webhooks/keycloak and campaigns/webhooks/* — the handler
 * explicitly runs under SYSTEM_JOB_CONTEXT.
 *
 * Unlike the provider webhooks, this write is NOT primarily about the
 * audit trigger either way: campaign_suppressions is deliberately excluded
 * from audit_chain_triggers (see prisma/triggers/002_audit_chain_triggers.sql
 * — high-volume operational data). SYSTEM_JOB_CONTEXT is required purely
 * for campaign_suppressions_rw's RLS WITH CHECK
 * (app_current_role() = 'SYSTEM_JOB' OR app_max_scope('campaign','write') =
 * 'ALL') — an unauthenticated request with no bound context satisfies
 * neither, so the INSERT would be rejected without it.
 *
 * GET and POST both unsubscribe outright (no separate confirm step) —
 * simplest correct behavior for a JSON API with no server-rendered
 * confirmation page; a future web front-end can add its own "are you
 * sure?" step before calling either.
 */
@ApiTags('campaigns')
@Controller('public/unsubscribe')
export class PublicUnsubscribeController {
  @Get()
  @ApiOkResponse({ type: UnsubscribeResponseDto })
  unsubscribeGet(@Query() query: UnsubscribeQueryDto): Promise<UnsubscribeResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.unsubscribe(query.token));
  }

  @Post()
  @ApiOkResponse({ type: UnsubscribeResponseDto })
  unsubscribePost(@Query() query: UnsubscribeQueryDto): Promise<UnsubscribeResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.unsubscribe(query.token));
  }

  private async unsubscribe(token: string): Promise<UnsubscribeResponseDto> {
    let payload;
    try {
      payload = verifyUnsubscribeToken(token);
    } catch {
      throw new BadRequestException('Invalid or expired unsubscribe token');
    }

    const prisma = getPrismaClient();
    await prisma.campaignSuppression
      .create({
        data: {
          contactId: payload.contactId,
          emailOrPhone: payload.emailOrPhone,
          channel: payload.channel,
          reason: 'User-initiated unsubscribe',
        },
      })
      .catch((err: unknown) => {
        // P2002 on (emailOrPhone, channel) = already unsubscribed — a
        // healthy no-op (clicking the link twice must not error).
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      });

    return { unsubscribed: true, emailOrPhone: payload.emailOrPhone, channel: payload.channel };
  }
}

import { BadGatewayException, HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type AiFeature } from '@topiadesk/db';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT a type-only import: NotificationsService is constructor-injected
// below — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationsService } from '../notifications/notifications.service';
import { getAnthropicClient } from './anthropic-client';
import { estimateCostUsd } from './pricing';
import type { SummarizeRequestDto, SummarizeResponseDto } from './dto/summarize-request.dto';
import type { ReplyDraftRequestDto, ReplyDraftResponseDto } from './dto/reply-draft-request.dto';

/**
 * Anthropic SDK wrapper + the org/user cost-cap gate. This cap logic is
 * the project's concrete "unlike Zendesk's uncapped AI billing"
 * differentiator (see docs/architecture.md) — both checks below run
 * BEFORE the (metered, real-money) Anthropic call, never after.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly notifications: NotificationsService,
  ) {}

  async summarize(dto: SummarizeRequestDto, user: AuthenticatedUser): Promise<SummarizeResponseDto> {
    const prompt = [
      `Summarize the following ${dto.entityType} record (id ${dto.entityId}) for an insurance broker who needs to`,
      'get up to speed quickly. Be concise, factual, and note any dates/amounts/risks that stand out.',
      '',
      dto.text,
    ].join('\n');
    const { text, costUsd } = await this.callClaude(prompt, user, 'SUMMARIZATION');
    return { summary: text, estimatedCostUsd: costUsd };
  }

  async replyDraft(dto: ReplyDraftRequestDto, user: AuthenticatedUser): Promise<ReplyDraftResponseDto> {
    const prompt = [
      `Draft a professional reply to the following customer interaction (${dto.entityType} id ${dto.entityId}) on`,
      'behalf of an insurance broker. Keep a helpful, concise, professional tone. Do not invent policy facts',
      'that are not present in the context below.',
      dto.instructions ? `\nAdditional instructions: ${dto.instructions}` : '',
      '\nContext:',
      dto.contextText,
    ].join('\n');
    const { text, costUsd } = await this.callClaude(prompt, user, 'REPLY_DRAFT');
    return { draft: text, estimatedCostUsd: costUsd };
  }

  private async callClaude(
    prompt: string,
    user: AuthenticatedUser,
    feature: AiFeature,
  ): Promise<{ text: string; costUsd: number }> {
    const client = getAnthropicClient();
    if (!client) {
      throw new ServiceUnavailableException(
        'AI Gateway is not configured: ANTHROPIC_API_KEY is not set. Set it in .env to enable AI features.',
      );
    }

    await this.enforceOrgMonthlyCap();
    await this.enforceUserDailyCap(user.id);

    let response;
    try {
      response = await client.messages.create({
        model: this.env.AI_GATEWAY_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Anthropic API call failed: ${message}`);
      throw new BadGatewayException('AI provider request failed. Try again shortly.');
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';
    const tokensIn = response.usage.input_tokens ?? 0;
    const tokensOut = response.usage.output_tokens;
    const costUsd = estimateCostUsd(this.env.AI_GATEWAY_MODEL, tokensIn, tokensOut);

    // Writes under the calling user's own RLS context: ai_usage_ledger_rw's
    // WITH CHECK is `user_id = app_current_user_id() OR SYSTEM_JOB` — since
    // userId here IS the current session's user, no context elevation is
    // needed for this insert (only the org-wide read below needs it).
    await getPrismaClient().aiUsageLedger.create({
      data: { userId: user.id, feature, tokensIn, tokensOut, estimatedCostUsd: costUsd.toFixed(4) },
    });

    return { text, costUsd };
  }

  /**
   * Sums AiUsageLedger.estimatedCostUsd for the current UTC calendar month
   * across ALL users, and rejects with 429 if that total already meets or
   * exceeds AI_ORG_MONTHLY_SPEND_CAP_USD.
   *
   * Runs the aggregate under SYSTEM_JOB RLS context deliberately: the
   * `ai_usage_ledger_rw` policy's USING clause only grants org-wide read to
   * SYSTEM_JOB or a role holding ai_usage:read at ALL scope (ADMIN/
   * COMPLIANCE_OFFICER per seed.ts) — an ordinary broker's own session
   * would have every other user's rows RLS-filtered out and silently
   * under-count the true org spend, defeating the cap. This is a narrow,
   * read-only elevation used only to compute a boolean
   * (would-this-exceed-the-cap), not to expose other users' individual
   * usage rows to the caller.
   */
  private async enforceOrgMonthlyCap(): Promise<void> {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const result = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().aiUsageLedger.aggregate({
        _sum: { estimatedCostUsd: true },
        where: { createdAt: { gte: startOfMonth } },
      }),
    );
    const spent = result._sum.estimatedCostUsd ? result._sum.estimatedCostUsd.toNumber() : 0;
    if (spent >= this.env.AI_ORG_MONTHLY_SPEND_CAP_USD) {
      // No built-in TooManyRequestsException in @nestjs/common v10 —
      // HttpException + HttpStatus.TOO_MANY_REQUESTS is the standard way
      // to emit a 429 without one.
      throw new HttpException(
        `Organization AI monthly spend cap reached ($${spent.toFixed(2)} of $${this.env.AI_ORG_MONTHLY_SPEND_CAP_USD.toFixed(2)}). Contact an administrator.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Counts today's (UTC) AiUsageLedger rows for this user; RLS already scopes this to `self`, no context elevation needed. */
  private async enforceUserDailyCap(userId: string): Promise<void> {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const count = await getPrismaClient().aiUsageLedger.count({ where: { userId, createdAt: { gte: startOfDay } } });
    if (count >= this.env.AI_PER_USER_DAILY_REQUEST_CAP) {
      // Self-notification: recipientUserId === the calling user, so this
      // satisfies notifications_rw's WITH CHECK without needing SYSTEM_JOB
      // context (see NotificationsService's doc comment).
      await this.notifications.createNotification({
        recipientUserId: userId,
        type: 'AI_DAILY_CAP_REACHED',
        title: 'AI daily request cap reached',
        body: `You've reached your daily limit of ${this.env.AI_PER_USER_DAILY_REQUEST_CAP} AI Gateway requests. The limit resets at midnight UTC.`,
        channel: 'IN_APP',
        dedupeKey: `ai-daily-cap:${userId}:${startOfDay.toISOString().slice(0, 10)}`,
      });
      throw new HttpException(
        `Daily AI request cap reached (${count} of ${this.env.AI_PER_USER_DAILY_REQUEST_CAP} requests today). Resets at midnight UTC.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

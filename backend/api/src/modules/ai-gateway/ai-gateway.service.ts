import { BadGatewayException, BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, Prisma, type AiFeature } from '@topiadesk/db';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT a type-only import: NotificationsService is constructor-injected
// below — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationsService } from '../notifications/notifications.service';
import { getAnthropicClient } from './anthropic-client';
import { getVoyageClient, VOYAGE_MODEL } from './voyage-client';
import { estimateCostUsd, estimateVoyageCostUsd } from './pricing';
import { queryRawWithRlsContext, executeRawWithRlsContext } from './rls-raw-query.util';
import type { IndexableEntityType } from './indexable-entity-types';
import type { SummarizeRequestDto, SummarizeResponseDto } from './dto/summarize-request.dto';
import type { ReplyDraftRequestDto, ReplyDraftResponseDto } from './dto/reply-draft-request.dto';
import type { SentimentRequestDto, SentimentResponseDto } from './dto/sentiment-request.dto';
import type { CategorizeRequestDto, CategorizeResponseDto } from './dto/categorize-request.dto';
import type { AccountInsightRequestDto, AccountInsightResponseDto } from './dto/account-insight-request.dto';
import type { SemanticIndexRequestDto, SemanticIndexResponseDto } from './dto/semantic-index-request.dto';
import type { SemanticSearchRequestDto, SemanticSearchResponseDto, SemanticSearchResultDto } from './dto/semantic-search-request.dto';
import type { UsageSummaryResponseDto } from './dto/usage-summary-response.dto';

// Fixed-size character chunking (not token-aware, not overlapping) — simple
// and defensible for the CRM note/knowledge-article text this indexes:
// ~6000 chars stays comfortably inside every Voyage model's per-input token
// limit, and short of a real semantic chunker (out of scope here), a bigger
// chunk just means a coarser retrieval unit, not incorrect results.
const CHUNK_SIZE_CHARS = 6000;
const SNIPPET_LENGTH_CHARS = 280;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;

interface ClaudeToolSpec {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

interface SentimentToolResult {
  label: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  score: number;
  escalationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  keyPhrases: string[];
}

interface CategorizeToolResult {
  suggestedCategory: string;
  confidence: number;
}

interface AccountInsightToolResult {
  narrative: string;
  riskFlags: string[];
}

interface SemanticEmbeddingSearchRow {
  entityType: string;
  entityId: string;
  content: string;
  score: number;
}

/**
 * Anthropic SDK wrapper + the org/user cost-cap gate. This cap logic is
 * the project's concrete "unlike Zendesk's uncapped AI billing"
 * differentiator (see docs/architecture.md) — both checks below run
 * BEFORE the (metered, real-money) Anthropic/Voyage call, never after.
 *
 * Every AI call this service exposes — including the new sentiment/
 * categorize/account-insight/semantic-index/semantic-search endpoints — is
 * ADVISORY ONLY: it returns a suggestion in the API response and never
 * silently writes the result onto a business record (Activity.aiSentiment,
 * Case.category, etc). A human — or an explicit, separate follow-up write
 * the human triggers — applies it. This preserves what the audit trail
 * means: every mutation still has a real actor behind it, not "the AI
 * decided this."
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

  /**
   * Structured, auditable result via Claude's tool-use (forced tool_choice)
   * rather than free text + a hand-rolled parser — the model MUST return
   * JSON matching inputSchema, no "parse this paragraph and hope" step that
   * could silently misfire on an escalation-risk flag.
   */
  async sentiment(dto: SentimentRequestDto, user: AuthenticatedUser): Promise<SentimentResponseDto> {
    const prompt = [
      `Analyze the sentiment of the following text, which is a ${dto.entityType} record (id ${dto.entityId}) from an`,
      'insurance brokerage CRM — a customer/prospect communication, an internal note, or similar. Flag genuine',
      'escalation risk (anger, an explicit threat to leave, regulatory/complaint language) conservatively: a false',
      'positive costs a broker unnecessary attention, a false negative costs a client who needed one.',
      '',
      dto.text,
    ].join('\n');

    const { result, costUsd } = await this.callClaudeTool<SentimentToolResult>(prompt, user, 'SENTIMENT_ANALYSIS', {
      name: 'record_sentiment_analysis',
      description: 'Record the sentiment analysis result for the given text.',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string', enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] },
          score: { type: 'number', minimum: -1, maximum: 1, description: 'Sentiment polarity: -1 very negative, 0 neutral, 1 very positive' },
          escalationRisk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          keyPhrases: { type: 'array', items: { type: 'string' }, description: 'Short verbatim phrases from the text that most drove this assessment' },
        },
        required: ['label', 'score', 'escalationRisk', 'keyPhrases'],
      },
    });

    return { ...result, estimatedCostUsd: costUsd };
  }

  async categorize(dto: CategorizeRequestDto, user: AuthenticatedUser): Promise<CategorizeResponseDto> {
    const prompt = [
      `Suggest the single best category for the following ${dto.entityType} record (id ${dto.entityId}) text from an`,
      'insurance brokerage CRM. Use a short, specific, human-readable category label (e.g. "Claims Inquiry",',
      '"Renewal Request", "Billing Dispute", "Coverage Question") — not a numeric code.',
      '',
      dto.text,
    ].join('\n');

    const { result, costUsd } = await this.callClaudeTool<CategorizeToolResult>(prompt, user, 'AUTO_CATEGORIZATION', {
      name: 'record_category_suggestion',
      description: 'Record the suggested category for the given text.',
      inputSchema: {
        type: 'object',
        properties: {
          suggestedCategory: { type: 'string', description: 'Short, specific, human-readable category label' },
          confidence: { type: 'number', minimum: 0, maximum: 1, description: '0 = low confidence, 1 = high confidence' },
        },
        required: ['suggestedCategory', 'confidence'],
      },
    });

    return { ...result, estimatedCostUsd: costUsd };
  }

  /**
   * Pulls the account's Policies/Premiums/RenewalSchedule/recent Activities
   * via NORMAL RLS-scoped Prisma queries under the caller's real session —
   * deliberately no context elevation: if this account isn't visible to the
   * caller, `findUnique` returns null under their real RLS scoping and this
   * 404s, exactly like every other account-scoped endpoint in this codebase.
   * INSIGHT's first real consumer (see AiFeature enum / seed history).
   */
  async accountInsight(dto: AccountInsightRequestDto, user: AuthenticatedUser): Promise<AccountInsightResponseDto> {
    const prisma = getPrismaClient();
    const account = await prisma.account.findUnique({
      where: { id: dto.accountId },
      include: {
        industry: true,
        policies: {
          include: {
            carrier: true,
            premiums: { orderBy: { dueDate: 'desc' }, take: 5 },
            renewalSchedule: true,
          },
        },
      },
    });
    if (!account) throw new NotFoundException('Account not found or not visible');

    const activities = await prisma.activity.findMany({
      where: { accountId: dto.accountId },
      orderBy: { occurredAt: 'desc' },
      take: 10,
    });

    const prompt = this.buildAccountInsightPrompt(account, activities);

    const { result, costUsd } = await this.callClaudeTool<AccountInsightToolResult>(prompt, user, 'INSIGHT', {
      name: 'record_account_insight',
      description: 'Record the renewal-meeting-prep brief for this account.',
      inputSchema: {
        type: 'object',
        properties: {
          narrative: {
            type: 'string',
            description: 'A renewal-meeting-prep brief: current book of business, upcoming renewals, payment health, and recent activity — written for a broker about to walk into the client meeting',
          },
          riskFlags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Short, specific risk flags (e.g. "Premium 45 days overdue", "Renewal in 12 days with no scheduled meeting", "No broker activity logged in 90 days")',
          },
        },
        required: ['narrative', 'riskFlags'],
      },
    });

    return { ...result, estimatedCostUsd: costUsd };
  }

  private buildAccountInsightPrompt(
    account: Prisma.AccountGetPayload<{
      include: { industry: true; policies: { include: { carrier: true; premiums: true; renewalSchedule: true } } };
    }>,
    activities: Prisma.ActivityGetPayload<Record<string, never>>[],
  ): string {
    const lines: string[] = [
      'Build a renewal-meeting-prep brief for an insurance broker about to meet with the client below.',
      'Base every claim strictly on the data provided — do not invent policy numbers, amounts, or dates.',
      '',
      `Account: ${account.name} (${account.accountType}, status: ${account.status})`,
      account.industry ? `Industry: ${account.industry.name}` : undefined,
      account.riskRating ? `Risk rating: ${account.riskRating}` : undefined,
      '',
      'Policies:',
    ].filter((l): l is string => l !== undefined);

    if (account.policies.length === 0) {
      lines.push('  (none on file)');
    }
    for (const policy of account.policies) {
      lines.push(
        `  - ${policy.policyNumber} | ${policy.lineOfBusiness} | ${policy.carrier.name} | status: ${policy.status} | sum insured: ${policy.sumInsured ?? 'n/a'} ${policy.currency} | expires: ${policy.expiryDate.toISOString().slice(0, 10)}`,
      );
      for (const premium of policy.premiums) {
        lines.push(
          `      premium due ${premium.dueDate.toISOString().slice(0, 10)}: ${premium.grossPremium} ${policy.currency}, status ${premium.status}, paid ${premium.paidAmount}`,
        );
      }
      if (policy.renewalSchedule) {
        lines.push(
          `      renewal due ${policy.renewalSchedule.renewalDueDate.toISOString().slice(0, 10)}, status ${policy.renewalSchedule.status}${policy.renewalSchedule.renewalMeetingDate ? `, meeting scheduled ${policy.renewalSchedule.renewalMeetingDate.toISOString().slice(0, 10)}` : ', no meeting scheduled yet'}`,
        );
      }
    }

    lines.push('', 'Recent activity (most recent first):');
    if (activities.length === 0) {
      lines.push('  (none on file)');
    }
    for (const activity of activities) {
      lines.push(`  - ${activity.occurredAt.toISOString().slice(0, 10)} [${activity.type}/${activity.direction}] ${activity.subject}${activity.outcome ? ` — outcome: ${activity.outcome}` : ''}`);
    }

    return lines.join('\n');
  }

  /**
   * Chunks the entity's text, embeds each chunk via Voyage, and upserts
   * SemanticEmbedding rows. `loadIndexableContent` below reads under the
   * caller's REAL ambient session (no elevation) — if the entity isn't
   * visible to them, this 404s before any embedding call is made, exactly
   * like accountInsight(). Only the actual row WRITE is elevated (see
   * upsertEmbeddingChunk's comment) — reading stays scoped, writing doesn't.
   */
  async index(dto: SemanticIndexRequestDto, user: AuthenticatedUser): Promise<SemanticIndexResponseDto> {
    const voyage = getVoyageClient();
    if (!voyage) {
      throw new ServiceUnavailableException(
        'Semantic search is not configured: VOYAGE_API_KEY is not set. Set it in .env to enable this feature.',
      );
    }

    const content = await this.loadIndexableContent(dto.entityType, dto.entityId);
    const chunks = chunkText(content);
    if (chunks.length === 0) {
      return { chunksIndexed: 0, estimatedCostUsd: 0 };
    }

    await this.enforceOrgMonthlyCap();
    await this.enforceUserDailyCap(user.id);

    let embedResult;
    try {
      embedResult = await voyage.embed(chunks, 'document');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Voyage embeddings API call failed: ${message}`);
      throw new BadGatewayException('Embeddings provider request failed. Try again shortly.');
    }

    const costUsd = estimateVoyageCostUsd(VOYAGE_MODEL, embedResult.totalTokens);

    for (let i = 0; i < chunks.length; i++) {
      await this.upsertEmbeddingChunk({
        entityType: dto.entityType,
        entityId: dto.entityId,
        chunkIndex: i,
        content: chunks[i]!,
        embedding: embedResult.embeddings[i]!,
      });
    }

    await getPrismaClient().aiUsageLedger.create({
      data: { userId: user.id, feature: 'SEMANTIC_EMBEDDING', tokensIn: embedResult.totalTokens, tokensOut: 0, estimatedCostUsd: costUsd.toFixed(4) },
    });

    return { chunksIndexed: chunks.length, estimatedCostUsd: costUsd };
  }

  async search(dto: SemanticSearchRequestDto, user: AuthenticatedUser): Promise<SemanticSearchResponseDto> {
    const voyage = getVoyageClient();
    if (!voyage) {
      throw new ServiceUnavailableException(
        'Semantic search is not configured: VOYAGE_API_KEY is not set. Set it in .env to enable this feature.',
      );
    }

    await this.enforceOrgMonthlyCap();
    await this.enforceUserDailyCap(user.id);

    let embedResult;
    try {
      embedResult = await voyage.embed([dto.query], 'query');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Voyage embeddings API call failed: ${message}`);
      throw new BadGatewayException('Embeddings provider request failed. Try again shortly.');
    }
    const costUsd = estimateVoyageCostUsd(VOYAGE_MODEL, embedResult.totalTokens);

    await getPrismaClient().aiUsageLedger.create({
      data: { userId: user.id, feature: 'SEMANTIC_SEARCH', tokensIn: embedResult.totalTokens, tokensOut: 0, estimatedCostUsd: costUsd.toFixed(4) },
    });

    const limit = Math.min(dto.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    const vectorLiteral = toVectorLiteral(embedResult.embeddings[0]!);
    const entityTypesFilter = dto.entityTypes && dto.entityTypes.length > 0 ? dto.entityTypes : null;

    // Runs under the CALLER'S OWN ambient RLS context (not elevated) —
    // semantic_embeddings_rw's USING clause is entity-type-aware (per-row
    // visibility joins back to the source account/knowledge_article), so
    // this correctly returns only rows the caller could already see.
    const rows = await queryRawWithRlsContext<SemanticEmbeddingSearchRow>(Prisma.sql`
      SELECT entity_type AS "entityType", entity_id AS "entityId", content,
             1 - (embedding <=> ${vectorLiteral}::vector) AS score
      FROM semantic_embeddings
      WHERE (${entityTypesFilter}::text[] IS NULL OR entity_type = ANY(${entityTypesFilter}::text[]))
      ORDER BY embedding <=> ${vectorLiteral}::vector ASC
      LIMIT ${limit}
    `);

    const results: SemanticSearchResultDto[] = rows.map((row) => ({
      entityType: row.entityType,
      entityId: row.entityId,
      snippet: row.content.length > SNIPPET_LENGTH_CHARS ? `${row.content.slice(0, SNIPPET_LENGTH_CHARS)}…` : row.content,
      score: row.score,
    }));

    return { results, estimatedCostUsd: costUsd };
  }

  /**
   * Pure aggregation, org-wide, for the current UTC calendar month. Runs
   * under SYSTEM_JOB for the SAME reason enforceOrgMonthlyCap() below does:
   * ai_usage_ledger_rw's USING clause only grants org-wide read to
   * SYSTEM_JOB or a role holding ai_usage:read at ALL scope, so an ordinary
   * caller's ambient session would silently under-count. @RequirePermission
   * ('ai_usage', 'read') on the controller is the coarse app-layer gate;
   * this elevation only ever computes an aggregate, never exposes another
   * user's individual usage rows.
   */
  async usageSummary(): Promise<UsageSummaryResponseDto> {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const rows = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().aiUsageLedger.groupBy({
        by: ['feature'],
        where: { createdAt: { gte: startOfMonth } },
        _count: { _all: true },
        _sum: { tokensIn: true, tokensOut: true, estimatedCostUsd: true },
      }),
    );

    const byFeature = rows
      .map((row) => ({
        feature: row.feature,
        requestCount: row._count._all,
        tokensIn: row._sum.tokensIn ?? 0,
        tokensOut: row._sum.tokensOut ?? 0,
        costUsd: row._sum.estimatedCostUsd ? row._sum.estimatedCostUsd.toNumber() : 0,
      }))
      .sort((a, b) => b.costUsd - a.costUsd);

    const totalCostUsd = Math.round(byFeature.reduce((sum, f) => sum + f.costUsd, 0) * 10_000) / 10_000;

    return {
      month: startOfMonth.toISOString().slice(0, 7),
      byFeature,
      totalCostUsd,
      orgMonthlySpendCapUsd: this.env.AI_ORG_MONTHLY_SPEND_CAP_USD,
    };
  }

  private async loadIndexableContent(entityType: IndexableEntityType, entityId: string): Promise<string> {
    const prisma = getPrismaClient();

    if (entityType === 'account') {
      const account = await prisma.account.findUnique({ where: { id: entityId } });
      if (!account) throw new NotFoundException('Account not found or not visible');
      return [
        `Account: ${account.name} (${account.accountType}, ${account.status})`,
        account.notes ? `Notes: ${account.notes}` : undefined,
        [account.addressLine1, account.addressLine2, account.city, account.state, account.country].filter(Boolean).length > 0
          ? `Address: ${[account.addressLine1, account.addressLine2, account.city, account.state, account.country].filter(Boolean).join(', ')}`
          : undefined,
      ]
        .filter((part): part is string => Boolean(part))
        .join('\n');
    }

    // 'knowledge_article' — the only other IndexableEntityType.
    const article = await prisma.knowledgeArticle.findUnique({ where: { id: entityId }, include: { currentVersion: true } });
    if (!article) throw new NotFoundException('Knowledge article not found or not visible');
    if (!article.currentVersion) throw new BadRequestException('This knowledge article has no published version to index yet');
    return `${article.title}\n\n${article.currentVersion.bodyMarkdown}`;
  }

  /**
   * `SemanticEmbedding.embedding` is a pgvector `Unsupported(...)` type,
   * fully absent from Prisma Client's generated CRUD API (confirmed
   * empirically), so this can't go through `prisma.semanticEmbedding.
   * upsert()` at all — raw SQL is the only path.
   *
   * Deliberately elevated to SYSTEM_JOB for this specific write only:
   * `semantic_embeddings_rw`'s WITH CHECK is `app_current_role() =
   * 'SYSTEM_JOB' OR app_max_scope('semantic_embedding', 'write') = 'ALL'`
   * — unlike its USING (read) clause, the WITH CHECK has NO per-entity-type
   * CASE at all, and 'semantic_embedding' isn't in seed.ts's seeded
   * `resources` array, so literally no role (not even ADMIN) currently
   * holds that grant. Flagged in this module's final report as a seed.ts
   * follow-up, same as ai-gateway.controller.ts already flags the
   * 'ai_usage:write' scoping gap rather than editing the shared seed file
   * directly. Safe to elevate here specifically because visibility was
   * ALREADY verified under the caller's real session one line up, in
   * loadIndexableContent() — this only ever writes a row the caller just
   * proved they can see, it doesn't broaden what they can read.
   */
  private async upsertEmbeddingChunk(params: {
    entityType: IndexableEntityType;
    entityId: string;
    chunkIndex: number;
    content: string;
    embedding: number[];
  }): Promise<void> {
    const vectorLiteral = toVectorLiteral(params.embedding);
    await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      executeRawWithRlsContext(Prisma.sql`
        INSERT INTO semantic_embeddings (entity_type, entity_id, chunk_index, content, embedding, model)
        VALUES (${params.entityType}, ${params.entityId}::uuid, ${params.chunkIndex}, ${params.content}, ${vectorLiteral}::vector, ${VOYAGE_MODEL})
        ON CONFLICT (entity_type, entity_id, model, chunk_index)
        DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
      `),
    );
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
   * Same cap-gate + usage-ledger contract as callClaude() above, but forces
   * a tool call (tool_choice: {type:'tool', name}) so the model MUST return
   * JSON matching `tool.inputSchema` in a `tool_use` content block, instead
   * of free text a caller would otherwise have to parse/hope-parses. Used
   * by sentiment()/categorize()/accountInsight() — anywhere the result
   * needs to be a structured, auditable value, not prose.
   */
  private async callClaudeTool<T>(
    prompt: string,
    user: AuthenticatedUser,
    feature: AiFeature,
    tool: ClaudeToolSpec,
  ): Promise<{ result: T; costUsd: number }> {
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
        max_tokens: 1536,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ name: tool.name, description: tool.description, input_schema: tool.inputSchema }],
        tool_choice: { type: 'tool', name: tool.name },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Anthropic API call failed: ${message}`);
      throw new BadGatewayException('AI provider request failed. Try again shortly.');
    }

    const toolBlock = response.content.find((block) => block.type === 'tool_use');
    const tokensIn = response.usage.input_tokens ?? 0;
    const tokensOut = response.usage.output_tokens;
    const costUsd = estimateCostUsd(this.env.AI_GATEWAY_MODEL, tokensIn, tokensOut);

    // Recorded even on a malformed/missing tool_use block — the call was
    // still made and billed by Anthropic, so the ledger must reflect it
    // regardless of whether the response was usable.
    await getPrismaClient().aiUsageLedger.create({
      data: { userId: user.id, feature, tokensIn, tokensOut, estimatedCostUsd: costUsd.toFixed(4) },
    });

    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new BadGatewayException('AI provider did not return the expected structured result.');
    }

    return { result: toolBlock.input as T, costUsd };
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

function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += CHUNK_SIZE_CHARS) {
    chunks.push(trimmed.slice(i, i + CHUNK_SIZE_CHARS));
  }
  return chunks;
}

/** pgvector text-input literal format: '[0.1,0.2,...]'. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

import { BadGatewayException, BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getPrismaClient, Prisma, runWithRlsContext, SYSTEM_JOB_CONTEXT, type AiFeature } from '@topiadesk/db';
import { ENV_TOKEN, type Env } from '../../common/config/config.module';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT a type-only import: LocalEmbeddingsService is constructor-injected
// below — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LocalEmbeddingsService, MODEL_ID as LOCAL_EMBEDDING_MODEL_ID } from './local/local-embeddings.service';
import { analyzeSentiment } from './local/local-sentiment';
import { summarizeText } from './local/local-summarizer';
import { CATEGORY_CANDIDATES, classifyCategory } from './local/local-categorizer';
import { routeChatMessage } from './chat-intent-router';
import { queryRawWithRlsContext, executeRawWithRlsContext } from './rls-raw-query.util';
import type { IndexableEntityType } from './indexable-entity-types';
import type { ChatMessageResponseDto, ChatSessionResponseDto, SendChatMessageResponseDto } from './dto/chat.dto';
import type { SummarizeRequestDto, SummarizeResponseDto } from './dto/summarize-request.dto';
import type { SentimentRequestDto, SentimentResponseDto } from './dto/sentiment-request.dto';
import type { CategorizeRequestDto, CategorizeResponseDto } from './dto/categorize-request.dto';
import type { AccountInsightRequestDto, AccountInsightResponseDto } from './dto/account-insight-request.dto';
import type { SemanticIndexRequestDto, SemanticIndexResponseDto } from './dto/semantic-index-request.dto';
import type { SemanticSearchRequestDto, SemanticSearchResponseDto, SemanticSearchResultDto } from './dto/semantic-search-request.dto';

// Paragraph-sized, not the old 6000-char chunking — that size minimized
// Voyage *API call count* (a real cost concern with a paid, per-call-billed
// provider); a smaller chunk gives materially better retrieval granularity
// now that embedding calls are free, fast, and local. Still fixed-offset,
// not sentence/paragraph-aware — a real semantic chunker remains out of
// scope here, same as before.
const CHUNK_SIZE_CHARS = 1000;
const SNIPPET_LENGTH_CHARS = 280;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;

interface AccountInsightNarrative {
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
 * Fully local AI assistant — every method here runs against in-process
 * models/rules (see ./local/*.ts) or plain Prisma reads, with zero external
 * API calls and zero per-request cost. Replaced Anthropic Claude + Voyage AI
 * (see git history / the approved plan for the prior implementation).
 *
 * Every AI feature this service exposes is still ADVISORY ONLY: it returns
 * a suggestion in the API response and never silently writes the result
 * onto a business record (Activity.aiSentiment, Case.category, etc). A
 * human — or an explicit, separate follow-up write the human triggers —
 * applies it. This preserves what the audit trail means: every mutation
 * still has a real actor behind it, not "the AI decided this."
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private categoryEmbeddingsPromise: Promise<number[][]> | null = null;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly localEmbeddings: LocalEmbeddingsService,
  ) {}

  /** Thin passthrough so chat-tools.ts (app_help_search) can embed text without needing its own LocalEmbeddingsService instance — this service is already the one place chat-tools.ts is handed a reference to. */
  embed(texts: string[]): Promise<number[][]> {
    return this.localEmbeddings.embed(texts);
  }

  async summarize(dto: SummarizeRequestDto, user: AuthenticatedUser): Promise<SummarizeResponseDto> {
    await this.enforceUserDailyCap(user.id);
    const summary = await summarizeText(dto.text, (texts) => this.localEmbeddings.embed(texts));
    await this.recordUsage(user.id, 'SUMMARIZATION');
    return { summary, estimatedCostUsd: 0 };
  }

  async sentiment(dto: SentimentRequestDto, user: AuthenticatedUser): Promise<SentimentResponseDto> {
    await this.enforceUserDailyCap(user.id);
    const result = analyzeSentiment(dto.text);
    await this.recordUsage(user.id, 'SENTIMENT_ANALYSIS');
    return { ...result, estimatedCostUsd: 0 };
  }

  async categorize(dto: CategorizeRequestDto, user: AuthenticatedUser): Promise<CategorizeResponseDto> {
    await this.enforceUserDailyCap(user.id);
    const [textEmbedding] = await this.localEmbeddings.embed([dto.text]);
    const candidateEmbeddings = await this.getCategoryCandidateEmbeddings();
    const result = classifyCategory(textEmbedding!, candidateEmbeddings);
    await this.recordUsage(user.id, 'AUTO_CATEGORIZATION');
    return { ...result, estimatedCostUsd: 0 };
  }

  /** Candidates are a fixed constant, so their embeddings are computed once and cached rather than re-embedded on every /ai/categorize call. */
  private getCategoryCandidateEmbeddings(): Promise<number[][]> {
    if (!this.categoryEmbeddingsPromise) {
      this.categoryEmbeddingsPromise = this.localEmbeddings.embed([...CATEGORY_CANDIDATES]);
    }
    return this.categoryEmbeddingsPromise;
  }

  /**
   * Pulls the account's Policies/Premiums/RenewalSchedule/recent Activities
   * via NORMAL RLS-scoped Prisma queries under the caller's real session —
   * deliberately no context elevation: if this account isn't visible to the
   * caller, `findUnique` returns null under their real RLS scoping and this
   * 404s, exactly like every other account-scoped endpoint in this codebase.
   */
  async accountInsight(dto: AccountInsightRequestDto, user: AuthenticatedUser): Promise<AccountInsightResponseDto> {
    await this.enforceUserDailyCap(user.id);

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

    const { narrative, riskFlags } = this.buildAccountInsightNarrative(account, activities);
    await this.recordUsage(user.id, 'INSIGHT');
    return { narrative, riskFlags, estimatedCostUsd: 0 };
  }

  /**
   * Renders the account/policy/activity data directly as the final
   * narrative — no LLM in the loop. `riskFlags` are deterministic checks
   * over the same data (overdue premium, renewal-soon-with-no-meeting, no
   * recent activity) rather than an LLM's inference over prose, which makes
   * this arguably MORE reliable than the previous Claude version: every
   * flag traces to an exact field value, not a model's interpretation of
   * one.
   */
  private buildAccountInsightNarrative(
    account: Prisma.AccountGetPayload<{
      include: { industry: true; policies: { include: { carrier: true; premiums: true; renewalSchedule: true } } };
    }>,
    activities: Prisma.ActivityGetPayload<Record<string, never>>[],
  ): AccountInsightNarrative {
    const now = new Date();
    const activePolicies = account.policies.filter((p) => !['QUOTED', 'CANCELLED', 'LAPSED'].includes(p.status));
    const totalSumInsured = activePolicies.reduce((sum, p) => sum + Number(p.sumInsured ?? 0), 0);
    const primaryCurrency = activePolicies[0]?.currency;
    const nextRenewal = activePolicies
      .map((p) => p.renewalSchedule)
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.renewalDueDate.getTime() - b.renewalDueDate.getTime())[0];

    const policyWord = activePolicies.length === 1 ? 'policy' : 'policies';
    const totalPart = totalSumInsured > 0 ? ` totaling ${totalSumInsured.toLocaleString()} ${primaryCurrency ?? ''} in sum insured` : '';
    const renewalPart = nextRenewal ? `, next renewal due ${nextRenewal.renewalDueDate.toISOString().slice(0, 10)}` : '';

    const lines: string[] = [
      `${account.name} holds ${activePolicies.length} active ${policyWord}${totalPart}${renewalPart}.`,
      '',
      'Policies:',
    ];
    if (account.policies.length === 0) lines.push('  (none on file)');
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
    if (activities.length === 0) lines.push('  (none on file)');
    for (const activity of activities) {
      lines.push(`  - ${activity.occurredAt.toISOString().slice(0, 10)} [${activity.type}/${activity.direction}] ${activity.subject}${activity.outcome ? ` — outcome: ${activity.outcome}` : ''}`);
    }

    const riskFlags: string[] = [];
    for (const policy of account.policies) {
      const overduePremium = policy.premiums.find((p) => p.status === 'OVERDUE');
      if (overduePremium) {
        const daysOverdue = Math.max(0, Math.floor((now.getTime() - overduePremium.dueDate.getTime()) / 86_400_000));
        riskFlags.push(`Premium ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue on ${policy.policyNumber}`);
      }
      if (policy.renewalSchedule) {
        const daysToRenewal = Math.floor((policy.renewalSchedule.renewalDueDate.getTime() - now.getTime()) / 86_400_000);
        if (daysToRenewal >= 0 && daysToRenewal <= 30 && !policy.renewalSchedule.renewalMeetingDate) {
          riskFlags.push(`Renewal on ${policy.policyNumber} in ${daysToRenewal} day${daysToRenewal === 1 ? '' : 's'} with no meeting scheduled`);
        }
        if (policy.renewalSchedule.status === 'AT_RISK') {
          riskFlags.push(`Renewal on ${policy.policyNumber} flagged at-risk`);
        }
      }
    }
    const mostRecentActivity = activities[0];
    if (!mostRecentActivity) {
      riskFlags.push('No broker activity logged for this account');
    } else {
      const daysSinceActivity = Math.floor((now.getTime() - mostRecentActivity.occurredAt.getTime()) / 86_400_000);
      if (daysSinceActivity > 90) riskFlags.push(`No broker activity logged in ${daysSinceActivity} days`);
    }

    return { narrative: lines.join('\n'), riskFlags };
  }

  /**
   * Chunks the entity's text, embeds each chunk locally, and upserts
   * SemanticEmbedding rows. `loadIndexableContent` below reads under the
   * caller's REAL ambient session (no elevation) — if the entity isn't
   * visible to them, this 404s before any embedding call is made, exactly
   * like accountInsight(). Only the actual row WRITE is elevated (see
   * upsertEmbeddingChunk's comment) — reading stays scoped, writing doesn't.
   */
  async index(dto: SemanticIndexRequestDto, user: AuthenticatedUser): Promise<SemanticIndexResponseDto> {
    const content = await this.loadIndexableContent(dto.entityType, dto.entityId);
    const chunks = chunkText(content);
    if (chunks.length === 0) return { chunksIndexed: 0, estimatedCostUsd: 0 };

    await this.enforceUserDailyCap(user.id);

    let embeddings: number[][];
    try {
      embeddings = await this.localEmbeddings.embed(chunks);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Local embedding call failed: ${message}`);
      throw new BadGatewayException('Local embedding model failed to process this content. Try again shortly.');
    }

    for (let i = 0; i < chunks.length; i++) {
      await this.upsertEmbeddingChunk({
        entityType: dto.entityType,
        entityId: dto.entityId,
        chunkIndex: i,
        content: chunks[i]!,
        embedding: embeddings[i]!,
      });
    }

    await this.recordUsage(user.id, 'SEMANTIC_EMBEDDING');
    return { chunksIndexed: chunks.length, estimatedCostUsd: 0 };
  }

  async search(dto: SemanticSearchRequestDto, user: AuthenticatedUser): Promise<SemanticSearchResponseDto> {
    await this.enforceUserDailyCap(user.id);

    let embedding: number[] | undefined;
    try {
      [embedding] = await this.localEmbeddings.embed([dto.query]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Local embedding call failed: ${message}`);
      throw new BadGatewayException('Local embedding model failed to process this query. Try again shortly.');
    }

    await this.recordUsage(user.id, 'SEMANTIC_SEARCH');

    const limit = Math.min(dto.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    const vectorLiteral = toVectorLiteral(embedding!);
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

    return { results, estimatedCostUsd: 0 };
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
   * — no seeded role currently holds that grant (a known, deliberate seed.ts
   * gap, unrelated to the provider swap). Safe to elevate here specifically
   * because visibility was ALREADY verified under the caller's real session
   * one line up, in loadIndexableContent() — this only ever writes a row
   * the caller just proved they can see, it doesn't broaden what they can
   * read.
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
        VALUES (${params.entityType}, ${params.entityId}::uuid, ${params.chunkIndex}, ${params.content}, ${vectorLiteral}::vector, ${LOCAL_EMBEDDING_MODEL_ID})
        ON CONFLICT (entity_type, entity_id, model, chunk_index)
        DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
      `),
    );
  }

  /** Writes one zero-cost AiUsageLedger row per logical operation — kept as a real audit trail of what was asked/used, even though local compute has no dollar cost to track. */
  private async recordUsage(userId: string, feature: AiFeature): Promise<void> {
    await getPrismaClient().aiUsageLedger.create({
      data: { userId, feature, tokensIn: 0, tokensOut: 0, estimatedCostUsd: '0.0000' },
    });
  }

  /**
   * Counts today's (UTC) AiUsageLedger rows for this user; RLS already
   * scopes this to `self`, no context elevation needed. Originally a
   * cost-cap gate (Claude/Voyage were metered, real-money APIs); now purely
   * an abuse/runaway-usage rate-limit — local inference has no spend risk,
   * but one user hammering shared CPU-bound model inference in a loop is
   * still worth capping.
   */
  private async enforceUserDailyCap(userId: string): Promise<void> {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const count = await getPrismaClient().aiUsageLedger.count({ where: { userId, createdAt: { gte: startOfDay } } });
    if (count >= this.env.AI_PER_USER_DAILY_REQUEST_CAP) {
      throw new HttpException(
        `Daily AI request cap reached (${count} of ${this.env.AI_PER_USER_DAILY_REQUEST_CAP} requests today). Resets at midnight UTC.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ---------------------------------------------------------------------
  // CRM copilot chat — session/message CRUD is plain RLS-scoped Prisma
  // (ai_chat_sessions_rw/ai_chat_messages_rw already restrict everything to
  // `self`); sendChatMessage routes the message through
  // chat-intent-router.ts's local intent-routing instead of an LLM.
  // ---------------------------------------------------------------------

  async createChatSession(user: AuthenticatedUser): Promise<ChatSessionResponseDto> {
    return getPrismaClient().aiChatSession.create({ data: { userId: user.id } });
  }

  async listChatSessions(user: AuthenticatedUser): Promise<ChatSessionResponseDto[]> {
    return getPrismaClient().aiChatSession.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 50 });
  }

  async getChatMessages(sessionId: string): Promise<ChatMessageResponseDto[]> {
    const session = await getPrismaClient().aiChatSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Chat session not found');
    return getPrismaClient().aiChatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
  }

  async deleteChatSession(sessionId: string): Promise<void> {
    const session = await getPrismaClient().aiChatSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Chat session not found');
    await getPrismaClient().aiChatSession.delete({ where: { id: sessionId } });
  }

  /**
   * Persists the user's message, routes it through chat-intent-router.ts
   * (stateless per turn — see that file's header comment), persists and
   * returns the reply. No multi-round tool-use loop needed anymore: the
   * router resolves everything (including any account-name lookup) in one
   * pass before returning a final answer.
   */
  async sendChatMessage(sessionId: string, content: string, user: AuthenticatedUser): Promise<SendChatMessageResponseDto> {
    const prisma = getPrismaClient();
    const session = await prisma.aiChatSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Chat session not found');

    await this.enforceUserDailyCap(user.id);

    const userMessage = await prisma.aiChatMessage.create({ data: { sessionId, role: 'USER', content } });

    let replyText: string;
    try {
      replyText = await routeChatMessage(content, user, this, (texts) => this.localEmbeddings.embed(texts));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Chat intent routing failed: ${message}`);
      replyText = "Something went wrong looking that up — try rephrasing, or ask a narrower question.";
    }

    const assistantMessage = await prisma.aiChatMessage.create({ data: { sessionId, role: 'ASSISTANT', content: replyText } });

    await Promise.all([
      prisma.aiChatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date(), title: session.title ?? content.slice(0, 80) },
      }),
      this.recordUsage(user.id, 'CHAT'),
    ]);

    return { userMessage, assistantMessage, estimatedCostUsd: 0 };
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

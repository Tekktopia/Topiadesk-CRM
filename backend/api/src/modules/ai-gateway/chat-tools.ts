import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@topiadesk/db';
import { buildDefaultRegistry, getReportDownloadUrl, renderReportChartImage, renderReportExport, uploadReportFile } from '@topiadesk/reports';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { AiGatewayService } from './ai-gateway.service';
import { APP_HELP_CORPUS } from './local/app-help-corpus';
import { findReportByExactMatch, generateReportInsights, recommendReports } from './report-matching';
import { setCurrentEntity, getCurrentEntity } from './conversation-state';
import { suggestForAccount, suggestForOpportunity, formatSuggestions, type Suggestion } from './smart-suggestions';

/**
 * Read-only tools the local chat-intent-router.ts can dispatch to — this is
 * what makes the copilot answer with real data rather than a canned
 * response. Every executor runs under the CALLER'S OWN ambient RLS context
 * (no SYSTEM_JOB elevation anywhere in this file) — the copilot can only
 * ever see what the asking user could already see themselves via the
 * normal app.
 */

const MAX_ROWS = 10;

interface CounterResult {
  accountCount?: number;
  contactCount?: number;
  policyCount?: number;
  opportunityCount?: number;
  leadCount?: number;
  caseCount?: number;
  campaignCount?: number;
  total?: number;
}

async function searchAccounts(user: AuthenticatedUser, input: { query: string }) {
  const accounts = await getPrismaClient().account.findMany({
    where: { name: { contains: input.query, mode: 'insensitive' } },
    select: { id: true, name: true, status: true, kycStatus: true, accountType: true },
    take: MAX_ROWS,
  });
  return { accounts };
}

async function getAccountSummary(user: AuthenticatedUser, input: { accountId: string }) {
  const account = await getPrismaClient().account.findUnique({
    where: { id: input.accountId },
    select: {
      id: true,
      name: true,
      status: true,
      accountType: true,
      kycStatus: true,
      kycExpiryDate: true,
      healthScore: true,
      riskRating: true,
      policies: {
        select: {
          id: true,
          policyNumber: true,
          status: true,
          sumInsured: true,
          renewalSchedule: { select: { status: true, renewalDueDate: true } },
          premiums: { select: { status: true, grossPremium: true, dueDate: true }, orderBy: { dueDate: 'desc' }, take: 3 },
        },
        take: MAX_ROWS,
      },
      opportunities: { select: { id: true, name: true, amount: true, currency: true }, take: MAX_ROWS },
      _count: { select: { policies: true, opportunities: true } },
    },
  });
  if (!account) return { found: false };

  // Track this as the current entity for pronoun resolution in future turns
  setCurrentEntity(user.id, { type: 'account', id: account.id, name: account.name, timestamp: new Date() });

  // Generate smart suggestions based on account data
  const suggestions = suggestForAccount(account);

  return { found: true, account, suggestions };
}

async function searchContacts(user: AuthenticatedUser, input: { query: string }) {
  const contacts = await getPrismaClient().contact.findMany({
    where: {
      OR: [{ firstName: { contains: input.query, mode: 'insensitive' } }, { lastName: { contains: input.query, mode: 'insensitive' } }],
    },
    select: { id: true, firstName: true, lastName: true },
    take: MAX_ROWS,
  });
  return { contacts };
}

async function getContactSummary(user: AuthenticatedUser, input: { contactId: string }) {
  const contact = await getPrismaClient().contact.findUnique({
    where: { id: input.contactId },
    select: { firstName: true, lastName: true, email: true, phone: true, title: true, account: { select: { name: true } } },
  });
  if (!contact) return { found: false };
  return { found: true, contact };
}

/**
 * Real policy/case number formats vary a lot even within one tenant's own
 * data (confirmed live: "TDK-PROP-2026-00042", "TCK-2026-0103", and a bare
 * "677799090" all coexist) — rather than guess which entity a candidate
 * token's shape implies, this tries it against BOTH tables at once and
 * returns whichever one actually has it. `policyNumber`/`caseNumber` are
 * both `@unique`, so this is a single indexed lookup each way, not a scan.
 */
async function searchOpportunities(user: AuthenticatedUser, input: { query: string }) {
  const opportunities = await getPrismaClient().opportunity.findMany({
    where: { name: { contains: input.query, mode: 'insensitive' } },
    select: {
      id: true,
      name: true,
      amount: true,
      currency: true,
      expectedCloseDate: true,
      dealHealthScore: true,
      account: { select: { name: true } },
      pipelineStage: { select: { name: true, isWon: true, isLost: true } },
    },
    take: MAX_ROWS,
  });

  // Suggestions only when exactly one deal matched — on an ambiguous
  // multi-hit the answer is "which one did you mean", and advice about a
  // deal the user hasn't picked yet would be noise.
  if (opportunities.length === 1) {
    const only = opportunities[0]!;
    setCurrentEntity(user.id, { type: 'opportunity', id: only.id, name: only.name, timestamp: new Date() });
    return { opportunities, suggestions: suggestForOpportunity(only) };
  }
  return { opportunities };
}

async function searchLeads(user: AuthenticatedUser, input: { query: string }) {
  const leads = await getPrismaClient().lead.findMany({
    where: {
      OR: [
        { firstName: { contains: input.query, mode: 'insensitive' } },
        { lastName: { contains: input.query, mode: 'insensitive' } },
        { companyName: { contains: input.query, mode: 'insensitive' } },
      ],
    },
    select: { firstName: true, lastName: true, companyName: true, status: true, email: true },
    take: MAX_ROWS,
  });
  return { leads };
}

async function searchCampaigns(user: AuthenticatedUser, input: { query: string }) {
  const campaigns = await getPrismaClient().campaign.findMany({
    where: { name: { contains: input.query, mode: 'insensitive' } },
    select: { name: true, status: true, channel: true },
    take: MAX_ROWS,
  });
  return { campaigns };
}

/**
 * Real policy/case/claim number formats vary a lot even within one tenant's own
 * data (confirmed live: "TDK-PROP-2026-00042", "TCK-2026-0103", and a bare
 * "677799090" all coexist) — rather than guess which entity a candidate token's
 * shape implies, this tries it against ALL THREE tables at once and returns
 * whichever one actually has it. `policyNumber`/`caseNumber`/`claimNumber` are
 * all `@unique`, so this is a single indexed lookup each way, not a scan.
 */
async function lookupIdentifier(user: AuthenticatedUser, input: { identifier: string }) {
  const [policy, caseRecord, claim] = await Promise.all([
    getPrismaClient().policy.findUnique({
      where: { policyNumber: input.identifier },
      select: { policyNumber: true, status: true, account: { select: { name: true } }, renewalSchedule: { select: { renewalDueDate: true, status: true } } },
    }),
    getPrismaClient().case.findUnique({
      where: { caseNumber: input.identifier },
      select: { caseNumber: true, subject: true, status: true, priority: true, account: { select: { name: true } } },
    }),
    getPrismaClient().claim.findUnique({
      where: { claimNumber: input.identifier },
      select: { claimNumber: true, status: true, priority: true, dateOfLoss: true, policy: { select: { policyNumber: true, account: { select: { name: true } } } } },
    }),
  ]);
  return { policy, caseRecord, claim };
}

async function listOpenCases(user: AuthenticatedUser, input: { accountId?: string }) {
  const cases = await getPrismaClient().case.findMany({
    where: {
      accountId: input.accountId,
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    },
    select: { id: true, caseNumber: true, subject: true, status: true, priority: true, accountId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
  });
  return { cases };
}

/**
 * Self-scoped (the asking user's own open pipeline, not org/department-wide
 * — a purpose-built, lighter tool for "how many open opportunities do I
 * have"-style questions, distinct from dashboards.controller.ts's
 * getOperationalKpis, which bakes in manager-dashboard department/org
 * scoping semantics that don't fit a first-person chat question).
 */
async function getPipelineSummary(user: AuthenticatedUser) {
  const opportunities = await getPrismaClient().opportunity.findMany({
    where: { ownerId: user.id, pipelineStage: { isWon: false, isLost: false } },
    select: { id: true, name: true, amount: true, currency: true, expectedCloseDate: true, pipelineStage: { select: { name: true } } },
    orderBy: { expectedCloseDate: 'asc' },
    take: MAX_ROWS,
  });
  const totalByCurrency: Record<string, number> = {};
  for (const opp of opportunities) {
    totalByCurrency[opp.currency] = (totalByCurrency[opp.currency] ?? 0) + Number(opp.amount);
  }
  return { count: opportunities.length, totalByCurrency, opportunities };
}

/** Self-scoped, all-time won-vs-lost — mirrors dashboards.controller.ts's win-rate definition (won / (won+lost)) but scoped to one owner instead of org-wide. */
async function getWinRate(user: AuthenticatedUser) {
  const [won, lost] = await Promise.all([
    getPrismaClient().opportunity.count({ where: { ownerId: user.id, pipelineStage: { isWon: true } } }),
    getPrismaClient().opportunity.count({ where: { ownerId: user.id, pipelineStage: { isLost: true } } }),
  ]);
  const decided = won + lost;
  return { won, lost, decided, winRate: decided > 0 ? won / decided : null };
}

/** Self-scoped via RenewalSchedule.assignedToId — renewals due in the next 60 days that aren't already decided (renewed/lapsed/declined). */
async function getRenewalsDue(user: AuthenticatedUser) {
  const now = new Date();
  const in60Days = new Date(now.getTime() + 60 * 86_400_000);
  const renewals = await getPrismaClient().renewalSchedule.findMany({
    where: {
      assignedToId: user.id,
      status: { notIn: ['RENEWED', 'LAPSED', 'DECLINED_TO_RENEW'] },
      renewalDueDate: { lte: in60Days },
    },
    select: {
      renewalDueDate: true,
      status: true,
      policy: { select: { policyNumber: true, account: { select: { name: true } } } },
    },
    orderBy: { renewalDueDate: 'asc' },
    take: MAX_ROWS,
  });
  return { count: renewals.length, renewals };
}

/** Self-scoped via Policy.account.ownerId — active (not quoted/cancelled/lapsed) policy count for the caller's own book. */
async function getPolicyCount(user: AuthenticatedUser) {
  const count = await getPrismaClient().policy.count({
    where: { account: { ownerId: user.id }, status: { notIn: ['QUOTED', 'CANCELLED', 'LAPSED'] } },
  });
  return { count };
}

/** Count entities across the system — total accounts, policies, opportunities, etc. */
async function countEntities(user: AuthenticatedUser) {
  const [accounts, contacts, policies, opportunities, leads, cases_] = await Promise.all([
    getPrismaClient().account.count(),
    getPrismaClient().contact.count(),
    getPrismaClient().policy.count({ where: { status: { notIn: ['CANCELLED', 'LAPSED'] } } }),
    getPrismaClient().opportunity.count({ where: { pipelineStage: { isWon: false } } }),
    getPrismaClient().lead.count({ where: { status: { notIn: ['CONVERTED', 'DISQUALIFIED'] } } }),
    getPrismaClient().case.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
  ]);

  return {
    accountCount: accounts,
    contactCount: contacts,
    policyCount: policies,
    opportunityCount: opportunities,
    leadCount: leads,
    caseCount: cases_,
    total: accounts + contacts + policies + opportunities + leads + cases_,
  };
}

/**
 * `id` is a `@db.Uuid` column, so passing a human-facing case NUMBER
 * ("TCK-2026-0103") to a `where: { id }` doesn't just miss — Postgres
 * rejects it outright with `22P02 invalid input syntax for type uuid`,
 * which executeChatTool's catch turns into a generic error object. Chat
 * only ever has the number (that's what a user pastes), so every call
 * failed. Branch on shape: UUID-looking input queries `id`, anything else
 * queries `caseNumber` (also `@unique`, so both are single indexed
 * lookups).
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Retrieve full case/ticket details — equivalent to account summary but for cases. */
async function getCaseSummary(user: AuthenticatedUser, input: { caseId: string }) {
  const ref = input.caseId.trim();
  const case_ = await getPrismaClient().case.findUnique({
    where: UUID_SHAPE.test(ref) ? { id: ref } : { caseNumber: ref },
    select: {
      id: true,
      caseNumber: true,
      subject: true,
      status: true,
      priority: true,
      createdAt: true,
      resolvedAt: true,
      assignedTo: { select: { fullName: true } },
      account: { select: { id: true, name: true } },
      description: true,
    },
  });
  if (!case_) return { error: 'Case not found' };
  setCurrentEntity(user.id, { type: 'case', id: case_.id, name: case_.caseNumber, timestamp: new Date() });
  return { case: case_ };
}

/** Retrieve a full knowledge base article (not just a snippet). */
async function getFullArticle(user: AuthenticatedUser, input: { articleId: string }) {
  const article = await getPrismaClient().knowledgeArticle.findUnique({
    where: { id: input.articleId },
    include: { currentVersion: true },
  });
  if (!article || article.status !== 'PUBLISHED') return { error: 'Article not found or not published' };

  return {
    article: {
      id: article.id,
      title: article.title,
      bodyMarkdown: article.currentVersion?.bodyMarkdown ?? '',
      createdAt: article.createdAt,
      updatedAt: article.currentVersion?.createdAt,
      viewCount: article.viewCount,
    },
  };
}

/**
 * Real SLA compliance, read from SlaClock — the table the SLA engine
 * actually writes (status RUNNING/PAUSED/SATISFIED/BREACHED, plus dueAt/
 * breachedAt/satisfiedAt). An earlier draft of this tool invented a
 * "breached if older than 7 days" heuristic over Case.createdAt and
 * reported the result as "SLA compliance rate" — a number with no
 * relationship to any configured SlaTarget. Anything labelled compliance
 * here has to come from the clocks or it's fabricated.
 *
 * `hasSlaData: false` is returned honestly when no clocks exist (SLA
 * policies configured but never applied, or a tenant not using them)
 * rather than reporting a vacuous 100%.
 */
async function getSlaMetrics(user: AuthenticatedUser) {
  const now = new Date();
  const prisma = getPrismaClient();

  const [breached, satisfied, running, atRisk] = await Promise.all([
    prisma.slaClock.count({ where: { status: 'BREACHED' } }),
    prisma.slaClock.count({ where: { status: 'SATISFIED' } }),
    prisma.slaClock.count({ where: { status: { in: ['RUNNING', 'PAUSED'] } } }),
    // Still running but already past due — breach the engine hasn't stamped yet.
    prisma.slaClock.count({ where: { status: 'RUNNING', dueAt: { lt: now } } }),
  ]);

  const closed = breached + satisfied;
  return {
    hasSlaData: closed + running > 0,
    breachedCount: breached,
    satisfiedCount: satisfied,
    openClockCount: running,
    overdueOpenCount: atRisk,
    // Compliance is measured over clocks that actually finished — counting
    // still-running clocks as "compliant" would inflate it toward 100%.
    complianceRate: closed > 0 ? Math.round((satisfied / closed) * 100) : null,
  };
}

/**
 * AuditLog.entityId is `@db.Uuid`, so the human-facing reference chat
 * actually receives (a case number, an account name) has to be resolved to
 * a real row id first — passing it straight through made Postgres reject
 * every query with 22P02. entityType is matched case-insensitively because
 * writers aren't consistent about casing (crm writes 'account', the
 * case-automation path writes 'CASE_AUTOMATION_GATE').
 */
async function getAuditTrail(user: AuthenticatedUser, input: { entityType: string; entityId: string }) {
  const prisma = getPrismaClient();
  const ref = input.entityId.trim();
  const kind = input.entityType.toLowerCase();

  let entityId: string | null = UUID_SHAPE.test(ref) ? ref : null;
  if (!entityId) {
    // Resolve the human reference to a row id for the entity kinds that
    // have a natural unique key a user would actually type.
    if (kind === 'case') {
      entityId = (await prisma.case.findUnique({ where: { caseNumber: ref }, select: { id: true } }))?.id ?? null;
    } else if (kind === 'policy') {
      entityId = (await prisma.policy.findUnique({ where: { policyNumber: ref }, select: { id: true } }))?.id ?? null;
    } else if (kind === 'account') {
      entityId =
        (await prisma.account.findFirst({ where: { name: { contains: ref, mode: 'insensitive' } }, select: { id: true } }))?.id ?? null;
    }
  }
  if (!entityId) return { resolved: false, entityType: kind, reference: ref, changes: [] };

  const limit = 10;
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entityType: { equals: kind, mode: 'insensitive' },
      entityId,
    },
    select: {
      id: true,
      action: true,
      changedFields: true,
      createdAt: true,
      actorUser: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return {
    resolved: true,
    entityType: kind,
    reference: ref,
    changeCount: auditLogs.length,
    changes: auditLogs.map((log) => ({
      action: log.action,
      changedFields: log.changedFields,
      createdAt: log.createdAt,
      actor: log.actorUser?.fullName ?? 'System',
    })),
  };
}

/** Retrieve team performance metrics — agent workload, SLA compliance, productivity. */
async function getTeamPerformance(user: AuthenticatedUser) {
  const agents = await getPrismaClient().user.findMany({
    select: {
      id: true,
      fullName: true,
      _count: {
        select: {
          assignedCases: { where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } },
        },
      },
    },
    orderBy: { fullName: 'asc' },
    take: MAX_ROWS,
  });

  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 86_400_000);

  // Get resolved cases in last 30 days for each agent
  const resolutions = await getPrismaClient().case.groupBy({
    by: ['assignedToId'],
    where: {
      resolvedAt: { gte: last30Days },
    },
    _count: { _all: true },
  });

  const resolutionMap = new Map(resolutions.map((r) => [r.assignedToId || '', r._count._all]));

  const performance = agents.map((agent) => ({
    agentName: agent.fullName,
    openCases: agent._count.assignedCases,
    totalWorkload: agent._count.assignedCases,
    casesResolvedLast30Days: resolutionMap.get(agent.id) ?? 0,
  }));

  return {
    teamSize: agents.length,
    agents: performance,
    totalWorkload: performance.reduce((sum, a) => sum + a.totalWorkload, 0),
  };
}

async function semanticSearch(user: AuthenticatedUser, input: { query: string }, aiGateway: AiGatewayService) {
  const result = await aiGateway.search({ query: input.query, limit: 5 }, user);
  return { results: result.results };
}

// A semantic-search score below this reads as "not actually relevant" for
// the local MiniLM model, same reasoning/threshold as chat-intent-router.ts.
const KB_RELEVANCE_THRESHOLD = 0.3;

/**
 * KB-scoped search — the fallback path for "how do I / what is" questions
 * the intent router couldn't match to a structured data tool. Two layers:
 * (1) the real semantic index (fast, ranked, but only covers articles
 * someone has explicitly run through /ai/index), (2) a plain-text fallback
 * over EVERY published article's title/body — guarantees a hit whenever the
 * literal words are present, regardless of whether anyone remembered to
 * index it. Confirmed live: most KB content wasn't indexed, so relying on
 * (1) alone left this tool returning nothing for real, answerable
 * questions.
 */
async function kbSearch(user: AuthenticatedUser, input: { query: string }, aiGateway: AiGatewayService) {
  const semantic = await aiGateway.search({ query: input.query, entityTypes: ['knowledge_article'], limit: 5 }, user);
  const goodSemantic = semantic.results.filter((r) => r.score >= KB_RELEVANCE_THRESHOLD);
  if (goodSemantic.length > 0) return { results: goodSemantic };

  const words = input.query
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);
  const textOr: Array<Record<string, unknown>> = [{ title: { contains: input.query, mode: 'insensitive' } }];
  for (const w of words) textOr.push({ currentVersion: { bodyMarkdown: { contains: w, mode: 'insensitive' } } });

  const articles = await getPrismaClient().knowledgeArticle.findMany({
    where: { status: 'PUBLISHED', OR: textOr },
    include: { currentVersion: true },
    take: 3,
  });
  return {
    results: articles.map((a) => ({
      entityType: 'knowledge_article',
      entityId: a.id,
      snippet: (a.currentVersion?.bodyMarkdown ?? '').slice(0, 280),
      score: 0.5, // a text match, not a real cosine score — deliberately mid-scale so it's neither hidden nor over-trusted.
    })),
  };
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

const APP_HELP_MATCH_THRESHOLD = 0.35;
// Each corpus entry can carry multiple real phrasings (question + keywords)
// — every phrase gets its own embedding, but they all resolve back to the
// SAME entry/answer. phraseEntryIndex[i] says which APP_HELP_CORPUS index
// corpusPhraseEmbeddings[i] belongs to, so matching can take the best
// score across an entry's phrasings without conflating different entries.
let appHelpEmbeddingsPromise: Promise<{ corpusPhraseEmbeddings: number[][]; phraseEntryIndex: number[] }> | null = null;

/**
 * Built-in "how does TopiaDesk work" corpus (local/app-help-corpus.ts) — a
 * second fallback tier after kbSearch, for exactly the questions kbSearch
 * has nothing for because no admin has written a KB article about it yet.
 * Always available, ships with the app.
 */
async function appHelpSearch(input: { query: string }, aiGateway: AiGatewayService) {
  if (!appHelpEmbeddingsPromise) {
    appHelpEmbeddingsPromise = (async () => {
      const phrases: string[] = [];
      const phraseEntryIndex: number[] = [];
      APP_HELP_CORPUS.forEach((entry, entryIndex) => {
        for (const phrase of [entry.question, ...(entry.keywords ?? [])]) {
          phrases.push(phrase);
          phraseEntryIndex.push(entryIndex);
        }
      });
      const corpusPhraseEmbeddings = await aiGateway.embed(phrases);
      return { corpusPhraseEmbeddings, phraseEntryIndex };
    })();
  }
  const [{ corpusPhraseEmbeddings, phraseEntryIndex }, queryEmbeddings] = await Promise.all([
    appHelpEmbeddingsPromise,
    aiGateway.embed([input.query]),
  ]);
  const queryEmbedding = queryEmbeddings[0]!;

  let bestEntryIndex = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < corpusPhraseEmbeddings.length; i++) {
    const score = dot(queryEmbedding, corpusPhraseEmbeddings[i]!);
    if (score > bestScore) {
      bestScore = score;
      bestEntryIndex = phraseEntryIndex[i]!;
    }
  }
  if (bestEntryIndex === -1 || bestScore < APP_HELP_MATCH_THRESHOLD) return { found: false };
  return { found: true, answer: APP_HELP_CORPUS[bestEntryIndex]!.answer, score: bestScore };
}

// Built once per process — the exact same registry ReportsController uses
// (backend/api/src/modules/reports/reports.controller.ts), so the chat
// copilot can only ever produce a report that also exists in the real
// Reports catalog; no drift between what's askable via chat and what's
// browsable at /reports.
const reportRegistry = buildDefaultRegistry();
const REPORT_MATCH_THRESHOLD = 0.4;
let reportEmbeddingsPromise: Promise<number[][]> | null = null;

function getReportCandidates() {
  return reportRegistry.list();
}

// Stripped from a report request before checking if anything specific is
// actually being asked for — leaves behind only words that could name a
// real report topic. Covers the phrasing this was built to fix: "help
// generate reports"/"what reports can you generate" strip down to nothing,
// while "generate a report on commission revenue" still leaves "commission
// revenue" behind.
const GENERIC_REQUEST_STOPWORDS =
  /\b(help|me|i|can|you|could|would|please|need|want|to|a|an|the|some|any|kind|kinds|type|types|of|on|for|about|with|my|what|which|generat\w*|creat\w*|build\w*|mak\w*|download\w*|produc\w*|export\w*|show\w*|giv\w*|reports?)\b/gi;

function isGenericReportRequest(query: string): boolean {
  return query.replace(GENERIC_REQUEST_STOPWORDS, '').trim().length === 0;
}

const REPORT_CATEGORY_LABELS: Record<string, string> = {
  FINANCE: 'Finance',
  SALES: 'Sales',
  RENEWALS: 'Renewals',
  CLAIMS: 'Claims',
  COMPLIANCE: 'Compliance',
  PRODUCTIVITY: 'Productivity',
  MARKETING: 'Marketing',
};

/**
 * Matches a free-text report request against the 16 fixed report
 * definitions' `${name}. ${description}`, embedded once at startup and
 * cached (same pattern as app_help_search's corpus). Deliberately does NOT
 * use the local LLM to pick the report or build filters — small instruct
 * models are not reliable at structured output (confirmed by research
 * before choosing this architecture) — so report-type selection stays
 * exactly as auditable/deterministic as every other structured tool here.
 * Runs with NO filters (every field on every one of the 16 reports'
 * filterSchema is optional, confirmed by reading all of them) — a
 * deliberate v1 scope cut, not an oversight: extracting real filter values
 * from free text reliably would need the same unreliable structured-output
 * step this design avoids.
 *
 * A genuinely generic ask ("help generate reports", with no topic named)
 * is handled BEFORE the embedding match, not by it — forcing a best-guess
 * embedding match on a query with no real topic in it produces a
 * plausible-looking but essentially random single suggestion, which is
 * worse than just listing what's actually available.
 */
async function generateReport(user: AuthenticatedUser, input: { query: string }, aiGateway: AiGatewayService) {
  const candidates = getReportCandidates();

  if (isGenericReportRequest(input.query)) {
    const byCategory = new Map<string, string[]>();
    for (const c of candidates) {
      const list = byCategory.get(c.category) ?? [];
      list.push(c.name);
      byCategory.set(c.category, list);
    }
    return {
      matched: false,
      generic: true,
      categories: [...byCategory.entries()].map(([category, names]) => ({
        label: REPORT_CATEGORY_LABELS[category] ?? category,
        names,
      })),
    };
  }

  // Try exact synonym match first (faster, more precise)
  let definition = findReportByExactMatch(input.query);

  // Fall back to embedding-based matching if no exact match
  if (!definition) {
    if (!reportEmbeddingsPromise) {
      reportEmbeddingsPromise = aiGateway.embed(candidates.map((c) => `${c.name}. ${c.description}`));
    }
    const [candidateEmbeddings, queryEmbeddings] = await Promise.all([
      reportEmbeddingsPromise,
      aiGateway.embed([input.query]),
    ]);
    const queryEmbedding = queryEmbeddings[0]!;

    const scored = candidates
      .map((c, i) => ({ candidate: c, score: dot(queryEmbedding, candidateEmbeddings[i]!) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score < REPORT_MATCH_THRESHOLD) {
      return { matched: false, closestNames: scored.slice(0, 3).map((s) => s.candidate.name) };
    }

    definition = best.candidate;
  }

  const parsedFilters = definition.filterSchema.safeParse({});
  if (!parsedFilters.success) {
    return { matched: true, reportName: definition.name, runFailed: true };
  }

  const result = await definition.execute(getPrismaClient(), parsedFilters.data);
  const runId = randomUUID();

  // Generate insights from the data
  const insights = generateReportInsights(result, definition.name);

  // Get related report recommendations
  const recommendations = recommendReports(input.query, definition.key);

  const pdfBuffer = await renderReportExport(result, 'pdf', definition.name, definition.defaultChartType);
  const pdfUploaded = await uploadReportFile(runId, definition.key, 'pdf', pdfBuffer);
  const downloadUrl = await getReportDownloadUrl(pdfUploaded.bucket, pdfUploaded.key, 300);

  let chartUrl: string | null = null;
  try {
    const chartBuffer = await renderReportChartImage(result, definition.defaultChartType, definition.name);
    if (chartBuffer) {
      const chartUploaded = await uploadReportFile(runId, definition.key, 'png', chartBuffer);
      chartUrl = await getReportDownloadUrl(chartUploaded.bucket, chartUploaded.key, 300);
    }
  } catch {
    // Chart rendering is optional — don't fail the whole response
  }

  return {
    matched: true,
    reportName: definition.name,
    reportDescription: definition.description,
    rowCount: result.totalRowCount,
    downloadUrl,
    chartUrl,
    insights,
    recommendations,
  };
}

/** Dispatches one tool call to its executor, returning a JSON-serializable result (or a graceful {error} object) — never throws, since a single bad lookup shouldn't abort the whole conversation turn. */
export async function executeChatTool(
  name: string,
  input: Record<string, unknown>,
  user: AuthenticatedUser,
  aiGateway: AiGatewayService,
): Promise<unknown> {
  try {
    switch (name) {
      case 'search_accounts':
        return await searchAccounts(user, input as { query: string });
      case 'get_account_summary':
        return await getAccountSummary(user, input as { accountId: string });
      case 'search_contacts':
        return await searchContacts(user, input as { query: string });
      case 'get_contact_summary':
        return await getContactSummary(user, input as { contactId: string });
      case 'search_opportunities':
        return await searchOpportunities(user, input as { query: string });
      case 'search_leads':
        return await searchLeads(user, input as { query: string });
      case 'search_campaigns':
        return await searchCampaigns(user, input as { query: string });
      case 'lookup_identifier':
        return await lookupIdentifier(user, input as { identifier: string });
      case 'list_open_cases':
        return await listOpenCases(user, input as { accountId?: string });
      case 'get_pipeline_summary':
        return await getPipelineSummary(user);
      case 'get_win_rate':
        return await getWinRate(user);
      case 'get_renewals_due':
        return await getRenewalsDue(user);
      case 'get_policy_count':
        return await getPolicyCount(user);
      case 'count_entities':
        return await countEntities(user);
      case 'get_case_summary':
        return await getCaseSummary(user, input as { caseId: string });
      case 'get_full_article':
        return await getFullArticle(user, input as { articleId: string });
      case 'get_sla_metrics':
        return await getSlaMetrics(user);
      case 'get_audit_trail':
        return await getAuditTrail(user, input as { entityType: string; entityId: string });
      case 'get_team_performance':
        return await getTeamPerformance(user);
      case 'semantic_search':
        return await semanticSearch(user, input as { query: string }, aiGateway);
      case 'kb_search':
        return await kbSearch(user, input as { query: string }, aiGateway);
      case 'app_help_search':
        return await appHelpSearch(input as { query: string }, aiGateway);
      case 'generate_report':
        return await generateReport(user, input as { query: string }, aiGateway);
      default:
        return { error: `Unknown tool "${name}"` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Tool execution failed' };
  }
}

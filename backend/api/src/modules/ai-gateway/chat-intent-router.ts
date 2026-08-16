import { getPrismaClient } from '@topiadesk/db';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { AiGatewayService } from './ai-gateway.service';
import { executeChatTool } from './chat-tools';
import { getCurrentEntity, usesContextualPronoun } from './conversation-state';
import { formatSuggestions } from './smart-suggestions';

/**
 * Local, rule-based replacement for Claude's agentic tool-use loop in
 * sendChatMessage(). No model exists here to "understand" arbitrary free
 * text — this routes a message to one of a small set of defined intents via
 * (1) fast, explainable keyword/regex matching (including a dedicated
 * greeting/capabilities intent so small talk doesn't fall through to the
 * "I don't know" message), falling back to (2) embedding-similarity against
 * a handful of example utterances per intent, then executes the matching
 * chat-tools.ts executor(s) and renders a templated natural-language answer
 * with the real data interpolated.
 *
 * Account-name matching does NOT require a lead-in phrase ("tell me
 * about...") — a bare name/fragment ("Northshore Manufacturing") is tried
 * directly against search_accounts as a last-resort before falling through
 * to the knowledge-base path. Confirmed live this was a real gap: typing
 * just an account name with no other words previously fell all the way
 * through to the generic fallback.
 *
 * Deliberately stateless per turn (see the approved plan) — no attempt at
 * cross-turn "it"/"that account" pronoun resolution in this pass.
 *
 * When nothing matches with reasonable confidence, this returns a clean,
 * honest "I don't know" message rather than guessing — the anti-
 * hallucination property a non-generative system can actually guarantee,
 * which is worth keeping visible rather than papering over.
 */

export type ChatIntent =
  | 'greeting_help'
  | 'thanks'
  | 'name_introduction'
  | 'generate_report'
  | 'account_lookup'
  | 'contact_lookup'
  | 'open_cases'
  | 'pipeline_summary'
  | 'win_rate'
  | 'renewals_due'
  | 'policy_count'
  | 'entity_count'
  | 'case_lookup'
  | 'sla_metrics'
  | 'audit_trail'
  | 'team_performance'
  | 'kb_help';

/**
 * Server clock, not the caller's own local time — there's no per-user
 * timezone anywhere in the schema (the only `timezone` column in the whole
 * database is BusinessHoursCalendar's, an org-level setting unrelated to an
 * individual user's own clock), so this is a reasonable approximation, not
 * a claim of exact personalization.
 */
function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getCapabilitiesMessage(user?: { fullName?: string }): string {
  // Real markdown bullet syntax (`- `), not a literal "•" character — see
  // the report-categories listing's own comment above for why: the
  // frontend now renders assistant replies through a real markdown-to-HTML
  // pass (frontend/web's markdown-preview.ts), which only recognizes `-`/
  // `*`-prefixed lines as list items; a literal "•" with plain `\n` joins
  // would merge into one run-on paragraph instead of a real bulleted list.
  const userName = user?.fullName?.split(' ')[0] || '';
  const greeting = `${getTimeOfDayGreeting()}${userName ? `, ${userName}` : ''}! I'm here to help. Here's what I can do:\n`;
  return (
    greeting +
    '- Look up an account, contact, opportunity, lead, or campaign by name\n' +
    '- Find a specific policy, case, or claim (just paste the number)\n' +
    '- Show you open tickets — all of them or just for one account\n' +
    '- Give you a snapshot of your pipeline and win rate\n' +
    '- Tell you what renewals are coming up\n' +
    '- Generate a report with charts (like "commission revenue by producer")\n' +
    '- Answer any "how do I..." questions about using TopiaDesk'
  );
}

/** A KB article longer than this gets trimmed in chat with a link to the real page — long enough for a complete short article, short enough not to bury the conversation. */
const KB_FULL_ARTICLE_CHAR_LIMIT = 2000;

const FALLBACK_MESSAGE =
  "I didn't catch that one — my apologies! I can help with looking up accounts, contacts, opportunities, policies, cases, and claims. I can also tell you about your pipeline, win rate, upcoming renewals, and walk you through how to do pretty much anything in TopiaDesk. Try asking me about a specific account or policy, or ask \"what can you help me with\" to see everything I can do.";

// ---- Fast path: explainable keyword/regex matching, tried before the ----
// ---- fuzzier embedding fallback below. -----------------------------------

const GREETING_HELP_PATTERN =
  /^\s*(hi|hello|hey|hiya|yo|sup|howdy|good (morning|afternoon|evening))\b|\bwhat can you (do|help)\b|\bwhat do you do\b|\bwhat.?s up\b|\bhelp\b\s*$|^\s*help\s*[!.?]*\s*$/i;
const THANKS_PATTERN = /^\s*(thanks|thank you|thx|ty|cheers|great,?\s*thanks|awesome,?\s*thanks|perfect,?\s*thanks)\b/i;
// Caught live: "my name is Moses" matched none of the fast patterns above
// (it's not a question, not a lookup, not a report ask) and none of the
// entity-search fallbacks below either (no account/contact/opportunity
// actually named that), so it fell all the way through to the slow LLM
// fallback — the exact "took longer than expected, and gave a wrong
// answer" complaint this was built to fix. A self-introduction isn't
// really a question needing an LLM's help at all; it deserves a fast,
// warm, deterministic reply instead. The name capture requires a
// capitalized word (the same proper-noun heuristic used elsewhere in this
// file) specifically to keep "i'm not sure"/"i am tired" from
// false-matching — "not"/"tired" aren't capitalized, so they don't.
//
// Deliberately NOT a single case-insensitive (/i) pattern: "I'm"/"I am"
// need their real-world capitalized "I" matched literally (a blanket /i
// flag would also make the `[A-Z]` name-capture accept lowercase, which
// is exactly the signal this regex relies on to avoid false-matching
// "i am tired"/"i'm not sure"). "my name is"/"this is" instead accept
// either capitalization directly via `[Mm]y`/`[Tt]his`, covering both
// sentence-start and mid-sentence phrasing without that tradeoff.
const NAME_INTRODUCTION_PATTERN = /\b(?:[Mm]y name is|I'?m|I am|[Tt]his is)\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,2})\b/;

// Real policy/case number formats coexist within one tenant's own data
// (letter-prefix-dash segments like "TDK-PROP-2026-00042", or a bare
// numeric "677799090") — this just flags "does something identifier-shaped
// appear in this message" cheaply; chat-tools.ts's lookupIdentifier tries
// the actual candidate against both tables rather than guessing from shape
// which one it is. Checked earliest of everything in routeChatMessage()
// since a real identifier match is unambiguous and should win over any
// other interpretation of the surrounding words.
const IDENTIFIER_CANDIDATE = /\b([A-Z]{2,}(?:-[A-Z0-9]+){1,}|\d{6,})\b/;

// Lead-ins that name a PERSON, not a company — kept distinct from
// ACCOUNT_LOOKUP_LEADIN below so "who is Sarah Johnson" resolves against
// contacts, not accounts.
const CONTACT_LOOKUP_LEADIN =
  /\b(?:who is|who'?s|contact (?:for|info(?:rmation)? for)|phone (?:number )?for|email (?:for|address for)|point of contact for|who do i (?:talk to|contact) (?:at|for))\b/i;
// Captures the name directly after one of CONTACT_LOOKUP_LEADIN's own
// phrases — NOT ACCOUNT_NAME_HINT below, which only recognizes
// about/for/on/regarding as trigger words. "who is"/"who's" don't contain
// any of those, so reusing it silently extracted nothing for exactly the
// most natural phrasing ("who is Sarah Johnson") — caught live: the whole
// lookup fell through to the generic LLM fallback instead of ever
// resolving a contact. This mirrors CONTACT_LOOKUP_LEADIN's own phrase
// list so extraction can never diverge from what the classifier matched.
const CONTACT_NAME_HINT =
  /\b(?:who is|who'?s|contact (?:for|info(?:rmation)? for)|phone (?:number )?for|email (?:for|address for)|point of contact for|who do i (?:talk to|contact) (?:at|for))\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,4})/i;
// Checked BEFORE the narrower structured intents below (win rate/renewals/
// etc.) — "generate a report on renewals due" would otherwise also match
// RENEWALS_PATTERN, but an explicit report/chart/graph request should
// always win: the user wants a real downloadable file, not just a live
// chat answer.
//
// "show"/"give" alongside generate/create/etc — caught live via the
// scripted diagnostic: "show me a claims turnaround report" has no verb
// from the original list and no "on/for/about" after "report" (nothing
// follows it), so it fell through to account_lookup/kb_help instead of
// matching an actual, real report in the 16-report catalog ("Claims
// Turnaround Time" — confirmed by generate_report's own no-match
// suggestions naming it as the closest embedding match for that exact
// query).
//
// Rewritten after a real user complaint: "help generate reports" produced
// an answer "not even related" to reports. Root cause was two compounding
// regex gaps in the original verb-then-report ordered match:
//  1. `\breport\b` requires a word boundary right after "report" — none
//     exists between "t" and "s" in "reports", so the whole plural form
//     never matched at all (`reports?` fixes this).
//  2. Exact verb words ("generate") don't match their own inflections
//     ("generating", "generates") or reversed word order ("what reports
//     can you generate" has the verb AFTER "report(s)"). Fixed by (a)
//     stemming each verb to `\w*` so any inflection matches, and (b)
//     replacing the ordered `verb...report` alternative with two
//     lookaheads that require both a verb-stem and report(s) to appear
//     ANYWHERE in the message, independent of order.
// Both gaps together meant a wide swath of natural "help me generate
// reports"-style phrasings silently fell through to the generic LLM
// fallback instead of ever reaching the report-matching tool.
const REPORT_REQUEST_PATTERN =
  /(?=[\s\S]*\breports?\b)(?=[\s\S]*\b(?:generat|creat|build|mak|download|produc|export|show|giv)\w*\b)|\breports?\b[\s\S]*\b(on|for|about)\b|\b(graph|chart)\b|\bvisuali[sz]e\b/i;
// Each pattern below picked up a few more real-world synonyms alongside
// its original phrasing — same "broaden after seeing a real gap" approach
// as REPORT_REQUEST_PATTERN's own history, applied proactively here rather
// than waiting for another live miss.
const WIN_RATE_PATTERN = /\bwin\s*rate\b|\bconversion\s*rate\b|\bclosing\s*rate\b|\bsuccess\s*rate\b|\bhit\s*rate\b|\bhow many.*(won|lost)\b/i;
const RENEWALS_PATTERN = /\brenewals?\b.*\b(due|coming|upcoming|soon|expiring)\b|\bupcoming\s+renewals?\b|\bwhat renewals?\b|\bpolic(?:y|ies)\s+(?:expiring|about to expire)\b/i;
const POLICY_COUNT_PATTERN = /\bhow many\s+(active\s+)?polic(y|ies)\b|\bpolic(y|ies)\s+(do (i|we) have|count|on my book)\b/i;
const PIPELINE_PATTERN = /\b(pipeline|opportunit(?:y|ies)|deals?|funnel)\b[\s\S]*\b(open|worth|value|count|progress)\b|\bhow many\b[\s\S]*\b(opportunit(?:y|ies)|deals?)\b/i;
const CASES_PATTERN = /\b(open|pending)\s+(cases?|tickets?|complaints?|issues?)\b|\b(cases?|tickets?|complaints?|issues?)\s+(open|pending)\b|what.?s\s+open\b/i;
const ENTITY_COUNT_PATTERN = /\bhow many\s+(accounts?|contacts?|leads?|opportunit(?:y|ies)|cases?|tickets?|campaigns?|policies?)\b|\btotal\s+(accounts?|contacts?|leads?|opportunit(?:y|ies)|cases?|tickets?|campaigns?|policies?)\b/i;
// Requires a real identifier-shaped token after case/ticket — a hyphenated
// code ("TCK-2026-0103") or 3+ digits. The first draft made the trailing
// group OPTIONAL, so it matched the word "case" followed by ANYTHING:
// "what is a case category" classified as a case lookup and answered "I
// couldn't find that case", swallowing a normal knowledge-base question
// (caught by scripted diagnosis, not by typecheck). ONE regex is used for
// both classification and extraction below, so the two can never drift —
// the same divergence CONTACT_LOOKUP_LEADIN/CONTACT_NAME_HINT hit before.
const CASE_REFERENCE = /\b(?:case|ticket)\s+(?:number\s+)?#?([A-Za-z]{2,}(?:-[A-Za-z0-9]+)+|\d{3,})\b/i;
const SLA_METRICS_PATTERN = /\bSLA\b.*\b(?:compliance|breach|metric|performance)\b|\b(?:SLA|response|resolution)\s+(?:time|compliance|performance)\b/i;
const AUDIT_TRAIL_PATTERN = /\b(?:audit trail|change history|who changed|activity log)\b|\bwho modified\b|\bwhen was\b.*\bchanged\b/i;
const TEAM_PERFORMANCE_PATTERN = /\b(?:team performance|agent performance|team workload|agent workload|team metrics)\b|\bhow\s+(?:is|are)\s+(?:my team|the team|agents?)\s+(?:doing|performing)\b/i;
const ACCOUNT_LOOKUP_LEADIN = /\b(?:tell me about|show me|what about|status of|details? (?:on|about)|info(?:rmation)? (?:on|about))\b/i;
// A capitalized word sequence following a preposition — a best-effort proper-
// noun heuristic, not real NER.
const ACCOUNT_NAME_HINT = /\b(?:about|for|on|regarding)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,4})/;
// Stop-words stripped from the front/back of a message before trying it as a
// bare account-name candidate — "Northshore Manufacturing" typed alone, or
// "Northshore Manufacturing?" / "what about Northshore Manufacturing" after
// the leadin regex above didn't fire for some other phrasing.
const LEADING_FILLER = /^(please|hey|hi|so|um|ok|okay)\b[\s,]*/i;

function extractAccountNameHint(message: string): string | undefined {
  return message.match(ACCOUNT_NAME_HINT)?.[1]?.trim();
}

function extractIntroducedName(message: string): string | undefined {
  return message.match(NAME_INTRODUCTION_PATTERN)?.[1]?.trim();
}

function extractIdentifierCandidate(message: string): string | undefined {
  return message.match(IDENTIFIER_CANDIDATE)?.[1];
}

function extractContactNameHint(message: string): string | undefined {
  return message.match(CONTACT_NAME_HINT)?.[1]?.trim();
}

function stripPunctuation(message: string): string {
  return message.replace(LEADING_FILLER, '').replace(/[?!.]+$/, '').trim();
}

interface RuleMatch {
  intent: ChatIntent;
  accountNameHint?: string;
}

function classifyByRules(message: string): RuleMatch | null {
  if (THANKS_PATTERN.test(message)) return { intent: 'thanks' };
  if (GREETING_HELP_PATTERN.test(message)) return { intent: 'greeting_help' };
  // Checked before the entity-search fallback below gets a chance to waste
  // several DB round-trips searching for an account/contact/opportunity
  // literally named "My Name Is Moses" — a self-introduction is small talk,
  // not a lookup.
  if (NAME_INTRODUCTION_PATTERN.test(message)) {
    const name = extractIntroducedName(message);
    if (name) return { intent: 'name_introduction', accountNameHint: name };
  }
  if (REPORT_REQUEST_PATTERN.test(message)) return { intent: 'generate_report' };
  if (WIN_RATE_PATTERN.test(message)) return { intent: 'win_rate' };
  if (RENEWALS_PATTERN.test(message)) return { intent: 'renewals_due' };
  if (POLICY_COUNT_PATTERN.test(message)) return { intent: 'policy_count' };
  if (PIPELINE_PATTERN.test(message)) return { intent: 'pipeline_summary' };
  if (CASES_PATTERN.test(message)) return { intent: 'open_cases', accountNameHint: extractAccountNameHint(message) };
  if (ENTITY_COUNT_PATTERN.test(message)) return { intent: 'entity_count' };
  if (SLA_METRICS_PATTERN.test(message)) return { intent: 'sla_metrics' };
  // Checked BEFORE the case reference below: "audit trail for case X" names
  // both, and the explicit history request is what the user actually asked
  // for — same precedence reasoning as REPORT_REQUEST_PATTERN winning over
  // the narrower intents it can overlap with.
  if (AUDIT_TRAIL_PATTERN.test(message)) return { intent: 'audit_trail' };
  if (CASE_REFERENCE.test(message)) return { intent: 'case_lookup' };
  if (TEAM_PERFORMANCE_PATTERN.test(message)) return { intent: 'team_performance' };
  // Checked before ACCOUNT_LOOKUP_LEADIN — "who is"/"contact for" name a
  // person, not a company, so a message matching both should resolve as a
  // contact. Reuses the same capitalized-name extraction as accounts (the
  // regex itself has no notion of "this is a person vs a company" — that
  // distinction lives entirely in which lead-in phrase was used).
  if (CONTACT_LOOKUP_LEADIN.test(message)) {
    const hint = extractContactNameHint(message);
    if (hint) return { intent: 'contact_lookup', accountNameHint: hint };
  }
  if (ACCOUNT_LOOKUP_LEADIN.test(message)) {
    const hint = extractAccountNameHint(message);
    if (hint) return { intent: 'account_lookup', accountNameHint: hint };
  }
  return null;
}

// ---- Embedding fallback: a handful of example phrasings per intent, -----
// ---- embedded once (module-level cache) and compared via cosine sim. ----

const INTENT_EXAMPLES: Partial<Record<ChatIntent, string[]>> = {
  account_lookup: ['what is the status of this account', 'give me an overview of this client', 'how is this customer doing', 'how healthy is this account'],
  contact_lookup: ['who is my contact at this account', 'what is their phone number', 'who do i talk to here', 'how do i reach this person'],
  open_cases: ['what needs attention right now', 'list pending support tickets', 'anything urgent to handle', 'what complaints are outstanding'],
  pipeline_summary: ['how much is in my pipeline', 'what is my open opportunity value', 'show my sales pipeline', 'what deals are in progress'],
  kb_help: ['how do i create a new lead', 'what is kyc', 'how do i process a renewal', 'explain how commissions work', 'how does this feature work', 'walk me through this'],
};
const EXAMPLE_INTENTS: ChatIntent[] = [];
const EXAMPLE_TEXTS: string[] = [];
for (const [intent, examples] of Object.entries(INTENT_EXAMPLES) as [ChatIntent, string[]][]) {
  for (const example of examples) {
    EXAMPLE_INTENTS.push(intent);
    EXAMPLE_TEXTS.push(example);
  }
}
let exampleEmbeddingsPromise: Promise<number[][]> | null = null;

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

// Cosine-similarity threshold for accepting the embedding fallback's best
// match — tuned up from an earlier, looser value after confirming live that
// 0.3 was letting off-topic questions ("what is my win rate", "what can you
// help me with") get force-matched to the nearest-but-wrong intent. Rule-
// based matches for both of those now happen before this ever runs; this
// threshold is defense-in-depth for phrasings neither the rules nor the
// examples anticipated — when in doubt, this should say no rather than
// guess, since the kb_help/app-help fallback chain after it is a safe,
// honest landing spot.
const EMBEDDING_MATCH_THRESHOLD = 0.42;

async function classifyByEmbedding(message: string, embed: (texts: string[]) => Promise<number[][]>): Promise<ChatIntent | null> {
  if (!exampleEmbeddingsPromise) {
    exampleEmbeddingsPromise = embed(EXAMPLE_TEXTS);
  }
  const [exampleEmbeddings, [messageEmbedding]] = await Promise.all([exampleEmbeddingsPromise, embed([message])]);
  let bestScore = -Infinity;
  let bestIntent: ChatIntent | null = null;
  for (let i = 0; i < exampleEmbeddings.length; i++) {
    const score = dot(messageEmbedding!, exampleEmbeddings[i]!);
    if (score > bestScore) {
      bestScore = score;
      bestIntent = EXAMPLE_INTENTS[i]!;
    }
  }
  return bestScore >= EMBEDDING_MATCH_THRESHOLD ? bestIntent : null;
}

// ---- Answer composition ----------------------------------------------

/** Resolves a free-text account name candidate to exactly one account, or a clarifying/not-found message if it can't. Returns `null` (not a message) when the candidate is too generic to even try (e.g. empty). */
async function resolveAccount(
  candidate: string,
  user: AuthenticatedUser,
  aiGateway: AiGatewayService,
): Promise<{ accountId: string; accountName: string } | { message: string } | null> {
  const query = stripPunctuation(candidate);
  if (query.length < 2) return null;
  const result = (await executeChatTool('search_accounts', { query }, user, aiGateway)) as { accounts?: Array<{ id: string; name: string }>; error?: string };
  const accounts = result.accounts ?? [];
  if (accounts.length === 0) return null;
  if (accounts.length > 1) {
    return { message: `I found ${accounts.length} accounts matching "${query}": ${accounts.map((a) => a.name).join(', ')}. Which one did you mean?` };
  }
  return { accountId: accounts[0]!.id, accountName: accounts[0]!.name };
}

/** Same shape/reasoning as resolveAccount() above, against contacts instead — first/last name substring match, disambiguates on multiple hits. */
async function resolveContact(
  candidate: string,
  user: AuthenticatedUser,
  aiGateway: AiGatewayService,
): Promise<{ contactId: string; contactName: string } | { message: string } | null> {
  const query = stripPunctuation(candidate);
  if (query.length < 2) return null;
  const result = (await executeChatTool('search_contacts', { query }, user, aiGateway)) as {
    contacts?: Array<{ id: string; firstName: string; lastName: string }>;
    error?: string;
  };
  const contacts = result.contacts ?? [];
  if (contacts.length === 0) return null;
  if (contacts.length > 1) {
    return {
      message: `I found ${contacts.length} contacts matching "${query}": ${contacts.map((c) => `${c.firstName} ${c.lastName}`).join(', ')}. Which one did you mean?`,
    };
  }
  return { contactId: contacts[0]!.id, contactName: `${contacts[0]!.firstName} ${contacts[0]!.lastName}` };
}

// Opportunities/leads/campaigns are lighter-weight than accounts/contacts
// (no rich nested "summary" worth a second round-trip) — these resolve
// straight to a final answer string in one step, rather than the two-step
// resolve-then-fetch-summary shape account/contact lookups use above.
// Returns null (not a message) when nothing matched, same "no answer to
// give yet, caller decides what happens next" contract as resolveAccount/
// resolveContact returning null.

async function resolveAndAnswerOpportunity(candidate: string, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string | null> {
  const query = stripPunctuation(candidate);
  if (query.length < 2) return null;
  const result = (await executeChatTool('search_opportunities', { query }, user, aiGateway)) as {
    opportunities?: Array<{ name: string; amount: number | string; currency: string; account: { name: string } | null; pipelineStage: { name: string } }>;
    suggestions?: Array<{ priority: string; message: string }>;
  };
  const opportunities = result.opportunities ?? [];
  if (opportunities.length === 0) return null;
  if (opportunities.length > 1) {
    return `I found ${opportunities.length} opportunities matching "${query}": ${opportunities.map((o) => o.name).join(', ')}. Which one did you mean?`;
  }
  const o = opportunities[0]!;
  const line = `${o.name}${o.account ? ` (${o.account.name})` : ''} — ${o.pipelineStage.name}, ${Number(o.amount).toLocaleString()} ${o.currency}.`;
  const advice = formatSuggestions(result.suggestions ?? []);
  return advice ? `${line}\n\n${advice}` : line;
}

async function resolveAndAnswerLead(candidate: string, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string | null> {
  const query = stripPunctuation(candidate);
  if (query.length < 2) return null;
  const result = (await executeChatTool('search_leads', { query }, user, aiGateway)) as {
    leads?: Array<{ firstName: string; lastName: string; companyName: string | null; status: string; email: string | null }>;
  };
  const leads = result.leads ?? [];
  if (leads.length === 0) return null;
  if (leads.length > 1) {
    return `I found ${leads.length} leads matching "${query}": ${leads.map((l) => `${l.firstName} ${l.lastName}`).join(', ')}. Which one did you mean?`;
  }
  const l = leads[0]!;
  const parts = [`${l.firstName} ${l.lastName}${l.companyName ? ` (${l.companyName})` : ''} — ${l.status}.`];
  if (l.email) parts.push(`Email: ${l.email}.`);
  return parts.join(' ');
}

async function resolveAndAnswerCampaign(candidate: string, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string | null> {
  const query = stripPunctuation(candidate);
  if (query.length < 2) return null;
  const result = (await executeChatTool('search_campaigns', { query }, user, aiGateway)) as {
    campaigns?: Array<{ name: string; status: string; channel: string }>;
  };
  const campaigns = result.campaigns ?? [];
  if (campaigns.length === 0) return null;
  if (campaigns.length > 1) {
    return `I found ${campaigns.length} campaigns matching "${query}": ${campaigns.map((c) => c.name).join(', ')}. Which one did you mean?`;
  }
  const c = campaigns[0]!;
  return `${c.name} — ${c.status}, ${c.channel} channel.`;
}

function formatCurrencyTotals(totals: Record<string, number>): string {
  return Object.entries(totals)
    .map(([currency, amount]) => `${amount.toLocaleString()} ${currency}`)
    .join(' + ');
}

async function answerAccountLookup(resolved: { accountId: string; accountName: string }, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('get_account_summary', { accountId: resolved.accountId }, user, aiGateway)) as {
    found: boolean;
    account?: {
      name: string;
      status: string;
      kycStatus: string;
      _count: { policies: number; opportunities: number };
      policies: Array<{ policyNumber: string; status: string; renewalSchedule: { renewalDueDate: string } | null }>;
    };
    suggestions?: Array<{ type: string; priority: string; message: string }>;
  };
  if (!result.found || !result.account) return `I couldn't find an account matching "${resolved.accountName}".`;

  const { account, suggestions } = result;
  const policyWord = account._count.policies === 1 ? 'policy' : 'policies';
  const oppWord = account._count.opportunities === 1 ? 'opportunity' : 'opportunities';
  const upcomingRenewal = account.policies
    .map((p) => p.renewalSchedule)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => new Date(a.renewalDueDate).getTime() - new Date(b.renewalDueDate).getTime())[0];

  const parts = [
    `${account.name} — ${account.status}, KYC ${account.kycStatus}.`,
    `${account._count.policies} ${policyWord}, ${account._count.opportunities} open ${oppWord}.`,
  ];
  if (upcomingRenewal) parts.push(`Next renewal due ${new Date(upcomingRenewal.renewalDueDate).toISOString().slice(0, 10)}.`);

  // Add smart suggestions if available
  if (suggestions && suggestions.length > 0) {
    const formatted = formatSuggestions(suggestions);
    if (formatted) parts.push('\n' + formatted);
  }

  return parts.join(' ');
}

async function answerContactLookup(resolved: { contactId: string; contactName: string }, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('get_contact_summary', { contactId: resolved.contactId }, user, aiGateway)) as {
    found: boolean;
    contact?: { firstName: string; lastName: string; email: string | null; phone: string | null; title: string | null; account: { name: string } | null };
  };
  if (!result.found || !result.contact) return `I couldn't find a contact matching "${resolved.contactName}".`;

  const { contact } = result;
  const parts = [`${contact.firstName} ${contact.lastName}${contact.title ? ` — ${contact.title}` : ''}${contact.account ? ` at ${contact.account.name}` : ''}.`];
  if (contact.email) parts.push(`Email: ${contact.email}.`);
  if (contact.phone) parts.push(`Phone: ${contact.phone}.`);
  if (!contact.email && !contact.phone) parts.push('No email or phone on file.');
  return parts.join(' ');
}

/** Formats an identifier-lookup hit (see IDENTIFIER_CANDIDATE/lookupIdentifier) — a policy or case number matched exactly, no disambiguation needed since both columns are `@unique`. */
function formatPolicyLookup(policy: {
  policyNumber: string;
  status: string;
  account: { name: string } | null;
  renewalSchedule: { renewalDueDate: string; status: string } | null;
}): string {
  const parts = [`Policy ${policy.policyNumber} — ${policy.status}${policy.account ? `, ${policy.account.name}` : ''}.`];
  if (policy.renewalSchedule) {
    parts.push(`Renewal ${policy.renewalSchedule.status}, due ${new Date(policy.renewalSchedule.renewalDueDate).toISOString().slice(0, 10)}.`);
  }
  return parts.join(' ');
}

function formatCaseLookup(caseRecord: { caseNumber: string; subject: string; status: string; priority: string; account: { name: string } | null }): string {
  return `Case ${caseRecord.caseNumber} — ${caseRecord.subject} (${caseRecord.priority}, ${caseRecord.status})${caseRecord.account ? `, ${caseRecord.account.name}` : ''}.`;
}

async function answerOpenCases(accountNameHint: string | undefined, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  let accountId: string | undefined;
  if (accountNameHint) {
    const resolved = await resolveAccount(accountNameHint, user, aiGateway);
    if (resolved && 'message' in resolved) return resolved.message;
    if (resolved) accountId = resolved.accountId;
  }

  const result = (await executeChatTool('list_open_cases', { accountId }, user, aiGateway)) as {
    cases?: Array<{ caseNumber: string; subject: string; priority: string }>;
  };
  const cases = result.cases ?? [];
  if (cases.length === 0) return accountId ? 'No open cases for that account.' : "You don't have any open cases right now.";

  const list = cases
    .slice(0, 5)
    .map((c) => `${c.caseNumber} — ${c.subject} (${c.priority})`)
    .join('; ');
  const caseWord = cases.length === 1 ? 'case' : 'cases';
  return `${cases.length} open ${caseWord}${accountId ? ' for that account' : ''}: ${list}${cases.length > 5 ? `, and ${cases.length - 5} more` : ''}.`;
}

async function answerPipelineSummary(user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('get_pipeline_summary', {}, user, aiGateway)) as { count: number; totalByCurrency: Record<string, number> };
  if (result.count === 0) return "You don't have any open opportunities right now.";
  const oppWord = result.count === 1 ? 'opportunity' : 'opportunities';
  return `You have ${result.count} open ${oppWord}, worth ${formatCurrencyTotals(result.totalByCurrency)}.`;
}

async function answerWinRate(user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('get_win_rate', {}, user, aiGateway)) as { won: number; lost: number; decided: number; winRate: number | null };
  if (result.decided === 0) return "You don't have any won or lost opportunities yet to calculate a win rate from.";
  return `Your win rate is ${Math.round(result.winRate! * 100)}% — ${result.won} won out of ${result.decided} decided (${result.lost} lost).`;
}

async function answerRenewalsDue(user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('get_renewals_due', {}, user, aiGateway)) as {
    count: number;
    renewals: Array<{ renewalDueDate: string; status: string; policy: { policyNumber: string; account: { name: string } } }>;
  };
  if (result.count === 0) return "You don't have any renewals due in the next 60 days.";
  const list = result.renewals
    .slice(0, 5)
    .map((r) => `${r.policy.account.name} (${r.policy.policyNumber}) — ${new Date(r.renewalDueDate).toISOString().slice(0, 10)}`)
    .join('; ');
  return `${result.count} renewal${result.count === 1 ? '' : 's'} due in the next 60 days: ${list}${result.count > 5 ? `, and ${result.count - 5} more` : ''}.`;
}

async function answerPolicyCount(user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('get_policy_count', {}, user, aiGateway)) as { count: number };
  if (result.count === 0) return "You don't have any active policies on your book right now.";
  return `You have ${result.count} active ${result.count === 1 ? 'policy' : 'policies'} on your book.`;
}

/**
 * `generate_report`'s executor either matched one of the 16 real report
 * types (ran it with default/no filters and produced a real PDF, plus a
 * chart image where the chart type supports it) or didn't — in which case
 * this is honest about the miss rather than guessing, and points at the
 * fixed catalog's closest names plus /reports/custom for anything more
 * specific (see chat-tools.ts's generateReport() for why filter-extraction
 * from free text isn't attempted here).
 */
async function answerGenerateReport(query: string, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('generate_report', { query }, user, aiGateway)) as {
    matched: boolean;
    generic?: boolean;
    categories?: Array<{ label: string; names: string[] }>;
    closestNames?: string[];
    reportName?: string;
    reportDescription?: string;
    runFailed?: boolean;
    rowCount?: number;
    downloadUrl?: string;
    chartUrl?: string | null;
    insights?: string[];
    recommendations?: Array<{ name: string; reason: string }>;
  };

  if (result.generic) {
    const lines = (result.categories ?? []).map((c) => `- **${c.label}**: ${c.names.join(', ')}`);
    return `Sure — here's what I can generate a report on:\n\n${lines.join('\n')}\n\nJust name one, e.g. "generate a report on commission revenue", or browse them all at /reports.`;
  }
  if (!result.matched) {
    const suggestions = (result.closestNames ?? []).join(', ');
    return `I couldn't match that to one of the reports TopiaDesk can generate.${suggestions ? ` Closest matches: ${suggestions}.` : ''} Browse the full catalog at /reports, or build something more specific at /reports/custom.`;
  }
  if (result.runFailed) {
    return `I found the "${result.reportName}" report, but couldn't run it with default filters — try it directly at /reports for more control over the filters.`;
  }

  const parts = [`Here's your **${result.reportName}** report (${result.rowCount} row${result.rowCount === 1 ? '' : 's'}): [Download PDF](${result.downloadUrl})`];
  if (result.chartUrl) parts.push(`![${result.reportName} chart](${result.chartUrl})`);

  // Add insights if available
  if (result.insights && result.insights.length > 0) {
    const insightText = result.insights.map((i) => `- ${i}`).join('\n');
    parts.push(`**Quick insights:**\n\n${insightText}`);
  }

  // Add related report recommendations
  if (result.recommendations && result.recommendations.length > 0) {
    const recText = result.recommendations.map((r) => `- **${r.name}**: ${r.reason}`).join('\n');
    parts.push(`**Related reports you might also find useful:**\n\n${recText}`);
  }

  parts.push('(Links expire in 5 minutes.)');
  return parts.join('\n\n');
}

async function answerEntityCount(user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('count_entities', {}, user, aiGateway)) as {
    accountCount?: number;
    contactCount?: number;
    policyCount?: number;
    opportunityCount?: number;
    leadCount?: number;
    caseCount?: number;
    campaignCount?: number;
    total?: number;
  };
  // Every line is emitted unconditionally: a truthiness check here drops
  // legitimate zero counts, and on a tenant where everything happens to be
  // zero that left the user with a header and no list under it at all
  // (caught live). "0 open cases" is a real answer, not a missing one.
  const rows: Array<[string, number]> = [
    ['Accounts', result.accountCount ?? 0],
    ['Contacts', result.contactCount ?? 0],
    ['Active leads', result.leadCount ?? 0],
    ['Open opportunities', result.opportunityCount ?? 0],
    ['Active policies', result.policyCount ?? 0],
    ['Open cases', result.caseCount ?? 0],
  ];
  if (rows.every(([, n]) => n === 0)) {
    return "There's nothing recorded yet — no accounts, contacts, leads, opportunities, policies, or cases. Once you start adding records I'll be able to break the numbers down for you.";
  }
  return ["Here's what's in the system right now:\n", ...rows.map(([label, n]) => `- **${label}**: ${n}`)].join('\n');
}

async function answerCaseLookup(message: string, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  // Same CASE_REFERENCE the classifier matched on — deliberately not a
  // second, looser copy.
  const match = message.match(CASE_REFERENCE);
  if (!match) return 'Could you give me the case or ticket number? For example, "case TDK-SUPP-2026-00042" or "ticket 123".';

  const caseId = match[1]!;
  const result = (await executeChatTool('get_case_summary', { caseId }, user, aiGateway)) as any;
  if (result.error) return `I couldn't find that case. Make sure the number is correct.`;

  const c = result.case;
  const parts = [
    `**${c.caseNumber}**: ${c.subject}\n`,
    `**Status**: ${c.status} | **Priority**: ${c.priority}`,
    `**Assigned to**: ${c.assignedTo?.fullName || 'Unassigned'}`,
    `**Account**: ${c.account?.name}`,
    `**Created**: ${new Date(c.createdAt).toLocaleDateString()}`,
  ];
  if (c.description) {
    parts.push(`\n**Description**: ${c.description.slice(0, 200)}`);
  }
  return parts.join('\n');
}

async function answerSlaMetrics(user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('get_sla_metrics', {}, user, aiGateway)) as {
    hasSlaData: boolean;
    breachedCount: number;
    satisfiedCount: number;
    openClockCount: number;
    overdueOpenCount: number;
    complianceRate: number | null;
  };
  if (!result.hasSlaData) {
    return "There aren't any SLA clocks running yet, so I can't report compliance. SLA targets are configured under Case Config → SLA Policies, and clocks start once a policy applies to a case.";
  }

  const parts = ['**SLA compliance**\n'];
  if (result.complianceRate !== null) {
    parts.push(`- **Met on time**: ${result.complianceRate}% (${result.satisfiedCount} of ${result.satisfiedCount + result.breachedCount} completed)`);
  }
  parts.push(`- **Breached**: ${result.breachedCount}`);
  parts.push(`- **Clocks still running**: ${result.openClockCount}`);
  if (result.overdueOpenCount > 0) {
    parts.push(`- ⚠️ **Past due right now**: ${result.overdueOpenCount} — these will breach unless they're actioned.`);
  }
  return parts.join('\n');
}

async function answerAuditTrail(message: string, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  // Try to extract entity type and ID from message
  const match = message.match(/(?:case|account|policy|opportunity|lead)\s+(?:#)?([A-Z0-9-]+|\d+)/i);
  if (!match) return 'To see change history, please name a specific record — for example, "audit trail for account Acme Corp" or "case TDK-SUPP-2026-00042".';

  const entityId = match[1];
  const entityType = message.match(/\b(case|account|policy|opportunity|lead)\b/i)?.[1] || 'case';

  const result = (await executeChatTool('get_audit_trail', { entityType, entityId }, user, aiGateway)) as {
    resolved: boolean;
    entityType: string;
    reference: string;
    changeCount?: number;
    changes: Array<{ action: string; actor: string; createdAt: string }>;
  };
  // "I couldn't find the record" and "the record exists but nothing has
  // changed" are genuinely different answers — collapsing both into "no
  // history" hides a typo'd reference from the user.
  if (!result.resolved) return `I couldn't find a ${result.entityType} matching "${result.reference}", so there's no history to show.`;
  if (result.changes.length === 0) return `No changes have been recorded for ${result.entityType} ${result.reference} yet.`;

  const parts = [`**Change history for ${result.entityType} ${result.reference}** (${result.changeCount} recorded)\n`];
  for (const change of result.changes.slice(0, 5)) {
    parts.push(`- **${change.action}** by ${change.actor} on ${new Date(change.createdAt).toLocaleDateString()}`);
  }
  return parts.join('\n');
}

async function answerTeamPerformance(user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const result = (await executeChatTool('get_team_performance', {}, user, aiGateway)) as {
    teamSize: number;
    agents: Array<{ agentName: string; openCases: number; casesResolvedLast30Days: number }>;
  };
  if (result.agents.length === 0) return "I couldn't find any team members to report on.";
  if (result.agents.every((a) => a.openCases === 0 && a.casesResolvedLast30Days === 0)) {
    return `All ${result.teamSize} team member${result.teamSize === 1 ? ' has' : 's have'} no open cases and nothing resolved in the last 30 days — there's no workload to compare yet.`;
  }

  const parts = [`**Team workload** (${result.teamSize} ${result.teamSize === 1 ? 'person' : 'people'})\n`];
  for (const agent of result.agents.slice(0, 10)) {
    parts.push(`- **${agent.agentName}**: ${agent.openCases} open, ${agent.casesResolvedLast30Days} resolved in the last 30 days`);
  }
  return parts.join('\n');
}

/**
 * Handle pronoun-based queries like "What's its status?" or "Tell me about them"
 * Uses the conversation state to resolve the pronouns to the current entity.
 */
async function answerPronounQuery(
  message: string,
  user: AuthenticatedUser,
  aiGateway: AiGatewayService,
): Promise<string | null> {
  if (!usesContextualPronoun(message)) return null;

  const currentEntity = getCurrentEntity(user.id);
  if (!currentEntity) {
    return "I'm not sure what you're referring to. Could you mention a specific account, opportunity, or case?";
  }

  // Re-route to the appropriate lookup for the current entity type
  if (currentEntity.type === 'account') {
    return answerAccountLookup(
      { accountId: currentEntity.id, accountName: currentEntity.name },
      user,
      aiGateway,
    );
  }

  if (currentEntity.type === 'opportunity') {
    // For now, just return basic info. Could expand with full opportunity lookup.
    return `I remember you were asking about "${currentEntity.name}". What would you like to know about it?`;
  }

  if (currentEntity.type === 'case') {
    const result = (await executeChatTool('get_case_summary', { caseId: currentEntity.id }, user, aiGateway)) as any;
    if (result.error) return `I couldn't find that case.`;
    const c = result.case;
    return `**${c.caseNumber}**: ${c.subject} — Status: ${c.status}, Priority: ${c.priority}`;
  }

  return null;
}

/**
 * Two-tier fallback: the real Knowledge Base first (kbSearch's own
 * semantic+text-match layers), then the built-in app-help corpus for
 * topics no KB article covers yet. Deliberately ends here, honestly, with
 * FALLBACK_MESSAGE rather than a third generative-LLM tier — a local LLM
 * (Qwen2.5-1.5B-Instruct) was tried here earlier, but was reported live as
 * making the system "very slow," and its removal was explicit and
 * deliberate, not an oversight: see the approved plan
 * (distributed-kindling-cupcake.md) for the parallel effort to build a
 * smaller, domain-fine-tuned replacement, which — if it ships — is meant
 * to slot back in at exactly this point.
 *
 * training/data/prepare_data.py (Track 2 of that plan) needs this exact
 * system-prompt text verbatim for training data to match what serving
 * actually sent — keep this comment's copy in sync with that script's own
 * copy if this text ever changes:
 *   "You are the TopiaDesk CRM assistant, talking to an insurance broker
 *   or account handler inside their own CRM. Be warm, direct, and concise
 *   (2-4 sentences). You have NO access to this specific tenant's live
 *   data at this point in the conversation — never invent a specific
 *   account name, policy number, amount, or figure. If the question
 *   depends on real data, say so plainly and suggest the user name a
 *   specific account, or ask about their pipeline, win rate, renewals, or
 *   policy count, which this assistant CAN look up directly. Otherwise,
 *   just answer helpfully from general knowledge about how an insurance
 *   brokerage CRM works."
 */
async function answerKbHelp(message: string, user: AuthenticatedUser, aiGateway: AiGatewayService): Promise<string> {
  const kbResult = (await executeChatTool('kb_search', { query: message }, user, aiGateway)) as { results?: Array<{ entityId: string; snippet: string; score: number }> };
  const kbResults = (kbResult.results ?? []).slice(0, 2);
  if (kbResults.length > 0) {
    // The top hit is returned in FULL (via get_full_article), not as the
    // 280-char snippet kb_search builds for ranking — a truncated answer
    // mid-sentence is exactly what "can it give me the document" was
    // asking to fix. Long articles are still capped, with a pointer to the
    // real page rather than a silent cut. Runner-up hits stay as snippets
    // so one question can't dump several full articles into the chat.
    const [top, ...rest] = kbResults;
    const full = (await executeChatTool('get_full_article', { articleId: top!.entityId }, user, aiGateway)) as {
      article?: { title: string; bodyMarkdown: string };
      error?: string;
    };

    const blocks: string[] = [];
    if (full.article) {
      const body = full.article.bodyMarkdown;
      const truncated = body.length > KB_FULL_ARTICLE_CHAR_LIMIT;
      blocks.push(`**${full.article.title}**\n\n${truncated ? body.slice(0, KB_FULL_ARTICLE_CHAR_LIMIT) : body}`);
      if (truncated) blocks.push(`_(Trimmed for chat — the full article is at /knowledge/${top!.entityId}.)_`);
    } else {
      blocks.push(`**Knowledge base article**: ${top!.snippet}`);
    }

    if (rest.length > 0) {
      const titles = await getPrismaClient().knowledgeArticle.findMany({
        where: { id: { in: rest.map((r) => r.entityId) } },
        select: { id: true, title: true },
      });
      const titleById = new Map(titles.map((t) => [t.id, t.title]));
      blocks.push(`Also related: ${rest.map((r) => titleById.get(r.entityId) ?? 'another article').join(', ')}.`);
    }
    return blocks.join('\n\n');
  }

  const helpResult = (await executeChatTool('app_help_search', { query: message }, user, aiGateway)) as { found: boolean; answer?: string };
  if (helpResult.found && helpResult.answer) return helpResult.answer;

  return FALLBACK_MESSAGE;
}

export async function routeChatMessage(
  message: string,
  user: AuthenticatedUser,
  aiGateway: AiGatewayService,
  embed: (texts: string[]) => Promise<number[][]>,
): Promise<string> {
  // Checked before anything else: an identifier-shaped token (a real
  // policy/case number, e.g. pasted straight from another screen) is
  // unambiguous, so it should win over any other reading of the message —
  // including one that happens to also contain a capitalized word or a
  // structured-intent keyword. A candidate that doesn't actually match
  // either table (a coincidental all-caps/numeric token in an otherwise
  // normal sentence) just falls through to the rest of routing below.
  // ...with one carve-out: "audit trail for case TCK-2026-0103" names an
  // identifier AND explicitly names a different operation on it. Without
  // this guard the fast path below answered with the case summary and the
  // history request was silently dropped (caught by scripted diagnosis —
  // fixing the equivalent ordering inside classifyByRules wasn't enough,
  // because this short-circuit runs before classification at all).
  const identifierCandidate = AUDIT_TRAIL_PATTERN.test(message) ? undefined : extractIdentifierCandidate(message);
  if (identifierCandidate) {
    const identifierResult = (await executeChatTool('lookup_identifier', { identifier: identifierCandidate }, user, aiGateway)) as {
      policy: Parameters<typeof formatPolicyLookup>[0] | null;
      caseRecord: Parameters<typeof formatCaseLookup>[0] | null;
    };
    if (identifierResult.policy) return formatPolicyLookup(identifierResult.policy);
    if (identifierResult.caseRecord) return formatCaseLookup(identifierResult.caseRecord);
  }

  // Check for pronoun-based queries like "What's its status?" or "Tell me about them"
  // This lets users refer back to previously mentioned entities without re-specifying them
  const pronounAnswer = await answerPronounQuery(message, user, aiGateway);
  if (pronounAnswer && pronounAnswer !== "I'm not sure what you're referring to. Could you mention a specific account, opportunity, or case?") {
    return pronounAnswer;
  }

  const ruleMatch = classifyByRules(message);

  // Contact lookup, same "try the rule-extracted hint" shape as account
  // lookup below — but a person's name failing to resolve as a contact
  // doesn't rule out account/kb_help below, so this doesn't early-return
  // on a miss.
  if (ruleMatch?.intent === 'contact_lookup' && ruleMatch.accountNameHint) {
    const resolved = await resolveContact(ruleMatch.accountNameHint, user, aiGateway);
    if (resolved && 'message' in resolved) return resolved.message;
    if (resolved) return answerContactLookup(resolved, user, aiGateway);
  }

  // Account lookup, without requiring a lead-in phrase: try the rule-
  // extracted hint first, then — if nothing else matched at all — the raw
  // message itself as a bare-name candidate (e.g. "Northshore
  // Manufacturing" typed alone). Only attempted when no other intent's
  // regex already claimed this message, so it never steals a pipeline/
  // cases/etc. question that happens to contain a capitalized word.
  if (ruleMatch?.intent === 'account_lookup' && ruleMatch.accountNameHint) {
    const resolved = await resolveAccount(ruleMatch.accountNameHint, user, aiGateway);
    if (resolved && 'message' in resolved) return resolved.message;
    if (resolved) return answerAccountLookup(resolved, user, aiGateway);
  }
  if (!ruleMatch) {
    // "Search the entire system": try the bare message as a name against
    // every entity type that's realistically nameable in one go, not just
    // accounts — run in parallel (each is one indexed `contains` query) so
    // a message that ultimately has no entity match at all doesn't pay for
    // five round-trips sequentially before reaching kb_help below.
    // Priority order on multiple hits (account first, campaign last)
    // reflects which entity a bare capitalized phrase most likely names in
    // a CRM chat — arbitrary but consistent, not a claim any order is
    // objectively correct.
    const [accountCandidate, contactCandidate, opportunityAnswer, leadAnswer, campaignAnswer] = await Promise.all([
      resolveAccount(message, user, aiGateway),
      resolveContact(message, user, aiGateway),
      resolveAndAnswerOpportunity(message, user, aiGateway),
      resolveAndAnswerLead(message, user, aiGateway),
      resolveAndAnswerCampaign(message, user, aiGateway),
    ]);
    if (accountCandidate && 'message' in accountCandidate) return accountCandidate.message;
    if (accountCandidate && 'accountId' in accountCandidate) return answerAccountLookup(accountCandidate, user, aiGateway);
    if (contactCandidate && 'message' in contactCandidate) return contactCandidate.message;
    if (contactCandidate && 'contactId' in contactCandidate) return answerContactLookup(contactCandidate, user, aiGateway);
    if (opportunityAnswer) return opportunityAnswer;
    if (leadAnswer) return leadAnswer;
    if (campaignAnswer) return campaignAnswer;
  }

  const intent = ruleMatch?.intent ?? (await classifyByEmbedding(message, embed)) ?? 'kb_help';
  const accountNameHint = ruleMatch?.accountNameHint;

  switch (intent) {
    case 'thanks':
      return "You're welcome! Always happy to help.";
    case 'greeting_help':
      return getCapabilitiesMessage(user);
    case 'name_introduction':
      return `${getTimeOfDayGreeting()}, ${accountNameHint}! Nice to meet you — I'm your TopiaDesk assistant. Any time you want to dig into accounts, policies, opportunities, or your pipeline, just ask.`;
    case 'generate_report':
      return answerGenerateReport(message, user, aiGateway);
    case 'account_lookup':
    case 'contact_lookup':
      // Reaches here only if the hint above failed to resolve — try the
      // knowledge base/app-help chain instead of a dead-end.
      return answerKbHelp(message, user, aiGateway);
    case 'open_cases':
      return answerOpenCases(accountNameHint, user, aiGateway);
    case 'pipeline_summary':
      return answerPipelineSummary(user, aiGateway);
    case 'win_rate':
      return answerWinRate(user, aiGateway);
    case 'renewals_due':
      return answerRenewalsDue(user, aiGateway);
    case 'policy_count':
      return answerPolicyCount(user, aiGateway);
    case 'entity_count':
      return answerEntityCount(user, aiGateway);
    case 'case_lookup':
      return answerCaseLookup(message, user, aiGateway);
    case 'sla_metrics':
      return answerSlaMetrics(user, aiGateway);
    case 'audit_trail':
      return answerAuditTrail(message, user, aiGateway);
    case 'team_performance':
      return answerTeamPerformance(user, aiGateway);
    case 'kb_help':
    default:
      return answerKbHelp(message, user, aiGateway);
  }
}

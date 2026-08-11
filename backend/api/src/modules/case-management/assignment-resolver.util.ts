import {
  getPrismaClient,
  runWithRlsContext,
  SYSTEM_JOB_CONTEXT,
  type AssignmentRule,
  type CaseManagementEntityType,
  type CasePriority,
  type CaseType,
  type Prisma,
} from '@topiadesk/db';

export interface AssignmentResolution {
  userId: string | null;
  reasoning: string;
}

interface AssignmentConditions {
  caseType?: CaseType;
  priority?: CasePriority;
}

function conditionsMatch(conditions: Prisma.JsonValue, caseType: CaseType | null, priority: CasePriority): boolean {
  if (conditions === null || typeof conditions !== 'object' || Array.isArray(conditions)) return true; // empty/malformed conditions = unconditional match
  const c = conditions as AssignmentConditions;
  if (c.caseType && c.caseType !== caseType) return false;
  if (c.priority && c.priority !== priority) return false;
  return true;
}

/** Highest-`priority`-first active AssignmentRule whose entityType and conditions match — the first one found is used, mirroring how SlaPolicy resolution picks a single best match rather than stacking several. */
export async function findMatchingAssignmentRule(
  entityType: CaseManagementEntityType,
  caseType: CaseType | null,
  priority: CasePriority,
): Promise<AssignmentRule | null> {
  const prisma = getPrismaClient();
  const rules = await prisma.assignmentRule.findMany({ where: { entityType, isActive: true }, orderBy: { priority: 'desc' } });
  return rules.find((rule) => conditionsMatch(rule.conditions, caseType, priority)) ?? null;
}

interface LeadAssignmentConditions {
  /** A LeadSource.code — plain string, not a closed enum (see LeadSource's own schema.prisma comment). */
  source?: string;
  minScore?: number;
}

function leadConditionsMatch(conditions: Prisma.JsonValue, source: string, score: number): boolean {
  if (conditions === null || typeof conditions !== 'object' || Array.isArray(conditions)) return true; // empty/malformed conditions = unconditional match
  const c = conditions as LeadAssignmentConditions;
  if (c.source && c.source !== source) return false;
  if (c.minScore !== undefined && score < c.minScore) return false;
  return true;
}

/** LEAD counterpart to findMatchingAssignmentRule() above — kept as a separate function rather than widening that one's signature, since Lead has no caseType/CasePriority equivalent and a union param would obscure both call sites. */
export async function findMatchingLeadAssignmentRule(source: string, score: number): Promise<AssignmentRule | null> {
  const prisma = getPrismaClient();
  const rules = await prisma.assignmentRule.findMany({ where: { entityType: 'LEAD', isActive: true }, orderBy: { priority: 'desc' } });
  return rules.find((rule) => leadConditionsMatch(rule.conditions, source, score)) ?? null;
}

const OPEN_CASE_STATUSES = ['NEW', 'OPEN', 'PENDING_CUSTOMER', 'PENDING_CARRIER', 'REOPENED'] as const;
const OPEN_CLAIM_STATUSES = ['NOTIFIED', 'UNDER_REVIEW', 'ADJUSTED', 'REOPENED'] as const;
const OPEN_LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED'] as const;

async function countOpenLoad(userId: string, entityType: CaseManagementEntityType): Promise<number> {
  const prisma = getPrismaClient();
  if (entityType === 'CASE') {
    return prisma.case.count({ where: { assignedToId: userId, status: { in: [...OPEN_CASE_STATUSES] } } });
  }
  if (entityType === 'LEAD') {
    return prisma.lead.count({ where: { assignedToId: userId, status: { in: [...OPEN_LEAD_STATUSES] } } });
  }
  return prisma.claim.count({ where: { adjusterId: userId, status: { in: [...OPEN_CLAIM_STATUSES] } } });
}

/**
 * Resolves the next assignee for `rule` without side effects unless
 * `persistCursor` is true — the dry-run POST /assignment-rules/:id/test
 * endpoint calls this with `persistCursor: false`; the real invocation from
 * Case/Claim creation (case-management module) calls it with `true`.
 *
 * ROUND_ROBIN: candidates ordered by id, cursor advances from
 * `lastAssignedUserId` (schema's own doc comment: "durable round-robin
 * cursor"). LOAD_BASED: fewest currently-open Cases/Claims wins.
 * SKILL_BASED: candidates are first filtered to users holding EVERY tag in
 * `requiredSkillTags`, then the least-loaded of those wins (same tiebreak
 * as LOAD_BASED) — skill match is a hard filter, not a scored preference.
 */
export async function resolveNextAssignee(rule: AssignmentRule, persistCursor: boolean): Promise<AssignmentResolution> {
  const prisma = getPrismaClient();

  if (!rule.candidatePoolTeamId) {
    return { userId: null, reasoning: 'AssignmentRule has no candidatePoolTeamId configured' };
  }

  const members = await prisma.teamMember.findMany({ where: { teamId: rule.candidatePoolTeamId }, include: { user: true } });
  let candidates = members.map((m) => m.user);

  if (candidates.length === 0) {
    return { userId: null, reasoning: `Team ${rule.candidatePoolTeamId} has no members` };
  }

  if (rule.strategy === 'SKILL_BASED' && rule.requiredSkillTags.length > 0) {
    const skills = await prisma.agentSkill.findMany({
      where: { userId: { in: candidates.map((c) => c.id) }, skillTag: { in: rule.requiredSkillTags } },
    });
    const tagsByUser = new Map<string, Set<string>>();
    for (const skill of skills) {
      if (!tagsByUser.has(skill.userId)) tagsByUser.set(skill.userId, new Set());
      tagsByUser.get(skill.userId)!.add(skill.skillTag);
    }
    candidates = candidates.filter((c) => rule.requiredSkillTags.every((tag) => tagsByUser.get(c.id)?.has(tag)));
    if (candidates.length === 0) {
      return { userId: null, reasoning: `No team member holds all required skills: ${rule.requiredSkillTags.join(', ')}` };
    }
  }

  let chosenId: string;
  let reasoning: string;

  if (rule.strategy === 'ROUND_ROBIN') {
    const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
    const lastIndex = rule.lastAssignedUserId ? sorted.findIndex((c) => c.id === rule.lastAssignedUserId) : -1;
    const next = sorted[(lastIndex + 1) % sorted.length]!;
    chosenId = next.id;
    reasoning = `Round-robin: next after ${rule.lastAssignedUserId ?? '(none)'} in pool of ${sorted.length}`;
  } else {
    const loads = await Promise.all(candidates.map(async (c) => ({ userId: c.id, load: await countOpenLoad(c.id, rule.entityType) })));
    loads.sort((a, b) => a.load - b.load);
    const best = loads[0]!;
    chosenId = best.userId;
    reasoning =
      rule.strategy === 'SKILL_BASED'
        ? `Skill-matched, least-loaded (${best.load} open) among ${loads.length} qualified candidate(s)`
        : `Least-loaded (${best.load} open) among ${loads.length} candidate(s)`;
  }

  if (persistCursor) {
    // `assignment_rules`'s WITH CHECK requires sla_config:write ALL scope
    // (ADMIN/COMPLIANCE_OFFICER only) — but this fires from Case/Lead
    // creation under the CREATING user's own context, who is almost always
    // a front-line broker/manager with only sla_config:read. Found live:
    // this update threw "new row violates row-level security policy" for
    // exactly that caller, and since it's the last statement in this
    // function the whole resolution was silently discarded (caught by the
    // callers' own .catch(), same as any other resolver failure) — auto-
    // assignment had never actually completed for a rule-matched Case
    // created by a non-admin/compliance user. Same "bookkeeping on data the
    // caller doesn't own, not their own content write" reasoning as
    // KnowledgeArticlesService.upsertFeedback()'s identical wrap.
    await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      prisma.assignmentRule.update({ where: { id: rule.id }, data: { lastAssignedUserId: chosenId } }),
    );
  }

  return { userId: chosenId, reasoning };
}

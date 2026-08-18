import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ApprovalQueryDto, PendingApprovalDto } from './dto/approval.dto';

/**
 * A read-only, cross-cutting queue over the generic `Approval` table — every
 * approve/reject *action* still lives on its own entity's own controller
 * (policy-version, cases, knowledge-articles, role-grants,
 * automation-run-states), each with different side effects. This just
 * answers "what's waiting on me, across all of those, in one place" instead
 * of a user needing to know six different screens exist and check each one.
 *
 * No @RequirePermission here, deliberately — same call as ApprovalChain's
 * own RLS comment: `approvals_rw`'s USING clause already restricts every
 * row to "I requested it, I decided it, or I hold approval:write at ALL
 * scope" before this handler ever sees it, so an app-layer permission
 * gate on top would only ever narrow an already-correct result, never
 * widen an incorrect one.
 */
@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('approvals')
export class ApprovalsController {
  @Get()
  @ApiOkResponse({ type: [PendingApprovalDto] })
  async list(@Query() query: ApprovalQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<PendingApprovalDto[]> {
    const prisma = getPrismaClient();
    const status = query.status ?? 'PENDING';
    // 'DECIDED' is a History-view shorthand, not a real Approval.status value
    // — most-recently-decided first, unlike the PENDING queue below (oldest
    // first, since an older pending request is the more urgent one).
    const isDecidedView = status === 'DECIDED';

    const rows = await prisma.approval.findMany({
      where: isDecidedView ? { status: { in: ['APPROVED', 'REJECTED'] } } : { status },
      include: { requestedBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } },
      orderBy: isDecidedView ? { decidedAt: 'desc' } : { createdAt: 'asc' },
    });

    const byType = new Map<string, string[]>();
    for (const row of rows) {
      const list = byType.get(row.entityType) ?? [];
      list.push(row.entityId);
      byType.set(row.entityType, list);
    }

    const [cases, articles, versions, grants, runs] = await Promise.all([
      byType.has('CASE_CLOSURE')
        ? prisma.case.findMany({ where: { id: { in: byType.get('CASE_CLOSURE') } }, select: { id: true, caseNumber: true, subject: true } })
        : [],
      byType.has('KNOWLEDGE_ARTICLE_PUBLISH')
        ? prisma.knowledgeArticle.findMany({ where: { id: { in: byType.get('KNOWLEDGE_ARTICLE_PUBLISH') } }, select: { id: true, title: true } })
        : [],
      byType.has('POLICY_ENDORSEMENT') || byType.has('POLICY_CANCELLATION')
        ? prisma.policyVersion.findMany({
            where: { id: { in: [...(byType.get('POLICY_ENDORSEMENT') ?? []), ...(byType.get('POLICY_CANCELLATION') ?? [])] } },
            select: { id: true, versionType: true, policy: { select: { id: true, policyNumber: true } } },
          })
        : [],
      byType.has('USER_ROLE_CHANGE')
        ? prisma.pendingRoleGrant.findMany({
            where: { id: { in: byType.get('USER_ROLE_CHANGE') } },
            select: { id: true, user: { select: { fullName: true } }, role: { select: { name: true } } },
          })
        : [],
      byType.has('CASE_AUTOMATION_GATE')
        ? prisma.automationRunState.findMany({
            where: { id: { in: byType.get('CASE_AUTOMATION_GATE') } },
            select: { id: true, entityType: true, entityId: true, rule: { select: { name: true } } },
          })
        : [],
    ]);

    const casesById = new Map(cases.map((c) => [c.id, c]));
    const articlesById = new Map(articles.map((a) => [a.id, a]));
    const versionsById = new Map(versions.map((v) => [v.id, v]));
    const grantsById = new Map(grants.map((g) => [g.id, g]));
    const runsById = new Map(runs.map((r) => [r.id, r]));

    return rows.map((row) => {
      let label = 'Approval request';
      let linkPath: string | null = null;

      switch (row.entityType) {
        case 'CASE_CLOSURE': {
          const c = casesById.get(row.entityId);
          label = c ? `Close case ${c.caseNumber} — ${c.subject}` : 'Close case';
          linkPath = c ? `/cases/${c.id}` : null;
          break;
        }
        case 'KNOWLEDGE_ARTICLE_PUBLISH': {
          const a = articlesById.get(row.entityId);
          label = a ? `Publish article: ${a.title}` : 'Publish knowledge article';
          linkPath = a ? `/knowledge/${a.id}` : null;
          break;
        }
        case 'POLICY_ENDORSEMENT':
        case 'POLICY_CANCELLATION': {
          const v = versionsById.get(row.entityId);
          const kind = row.entityType === 'POLICY_ENDORSEMENT' ? 'Endorsement' : 'Cancellation';
          label = v ? `${kind} on policy ${v.policy.policyNumber}` : `${kind} on a policy`;
          linkPath = v ? `/policies/${v.policy.id}` : null;
          break;
        }
        case 'USER_ROLE_CHANGE': {
          const g = grantsById.get(row.entityId);
          label = g ? `Grant "${g.role.name}" to ${g.user.fullName}` : 'Role change';
          linkPath = '/admin/role-grants';
          break;
        }
        case 'CASE_AUTOMATION_GATE': {
          const r = runsById.get(row.entityId);
          label = r ? `Workflow approval — ${r.rule.name}` : 'Workflow approval gate';
          linkPath = r ? `/${r.entityType === 'CLAIM' ? 'claims' : 'cases'}/${r.entityId}` : null;
          break;
        }
        default:
          label = 'Approval request';
          linkPath = null;
      }

      return {
        id: row.id,
        entityType: row.entityType,
        status: row.status,
        reason: row.reason,
        requestedById: row.requestedById,
        requestedByName: row.requestedBy?.fullName ?? null,
        createdAt: row.createdAt,
        label,
        linkPath,
        isMine: row.requestedById === user.id,
        decidedAt: row.decidedAt,
        decisionNote: row.decisionNote,
        approvedByName: row.approvedBy?.fullName ?? null,
      };
    });
  }
}

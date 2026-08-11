import { randomBytes } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, Prisma, type Case } from '@topiadesk/db';
import { AuditLogResponseDto } from '../audit/dto/audit-log-response.dto';
import { loadEntityHistory } from '../audit/entity-history';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT type-only imports — constructor-injected below, see claims.controller.ts's comment.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CommentsService } from './comments.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { WatchersService } from './watchers.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MacrosService } from './macros.service';
import {
  BulkAssignCasesDto,
  BulkUpdateCasesDto,
  CaseQueryDto,
  CaseQueueQueryDto,
  CaseResponseDto,
  ChangeCaseStatusDto,
  CreateCaseDto,
  LinkChildCaseDto,
  MergeCaseDto,
  UpdateCaseDto,
} from './dto/case.dto';
import { AddWatcherDto, CaseWatcherResponseDto } from './dto/case-watcher.dto';
import { CommentResponseDto, CreateCommentDto } from './dto/comment.dto';
import { ApplyMacroResponseDto } from './dto/macro.dto';
import { BulkActionResponseDto } from './dto/bulk-action.dto';
import { CaseClosureApprovalResponseDto, DecideCaseClosureDto, RequestCaseClosureDto } from './dto/case-closure.dto';
import { applyCaseStatusTransition } from './status-transition.util';
import { assertValidCaseTransition } from './case-lifecycle';
import { ensureCaseSlaClocks } from './sla-clock.util';
import { enqueueEntityEvent } from './automation-events.util';
import { enqueueTeamAssignmentNotification } from './notify-team-assignment-queue';
import { findMatchingAssignmentRule, resolveNextAssignee } from './assignment-resolver.util';
import { buildCaseOrderBy, buildCaseWhere } from './case-query.util';
import { diffBulkIds } from './bulk-actions';
import { validateBusinessRules } from './business-rules.validator';

function generateCaseNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `CASE-${datePart}-${suffix}`;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const UNASSIGNED_QUEUE_STATUSES = ['NEW', 'OPEN', 'REOPENED'] as const;

/**
 * Enquiry/Service Request/Complaint — the Case side of Case Management (see
 * Claim's separate table for money-movement claims). Visibility is scoped
 * via assignedToId, the linked Account's owner, or assignedTeamId team
 * membership (prisma/rls/002_policies.sql's cases_rw, an additive OR of all
 * three) — no manual WHERE filtering here for that.
 */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('cases')
export class CasesController {
  constructor(
    private readonly comments: CommentsService,
    private readonly watchers: WatchersService,
    private readonly macros: MacrosService,
  ) {}

  @Get()
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: [CaseResponseDto] })
  async list(@Query() query: CaseQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<CaseResponseDto[]> {
    const where = await buildCaseWhere(query, user.id);
    return getPrismaClient().case.findMany({
      where,
      orderBy: buildCaseOrderBy(query),
      skip: query.skip,
      take: query.take ?? 100,
    });
  }

  /** Same filter-building as list() (see case-query.util.ts's header comment) — kept as a separate endpoint rather than a `{total, rows}` wrapper around list() specifically so GET /cases's existing Case[] response shape never changes for callers that already rely on it. */
  @Get('count')
  @RequirePermission('case', 'read')
  @ApiOkResponse({ schema: { type: 'object', properties: { total: { type: 'number' } } } })
  async count(@Query() query: CaseQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<{ total: number }> {
    const where = await buildCaseWhere(query, user.id);
    const total = await getPrismaClient().case.count({ where });
    return { total };
  }

  /**
   * Real bulk endpoints — previously the ticket workspace fanned out one
   * PATCH/POST per selected row client-side (see (cases)/_lib/hooks.ts's
   * settleAndReport, kept as the pattern's own header comment explained:
   * "no bulk/* endpoint exists"). This is that endpoint. RLS-invisible ids
   * land in `skipped` via diffBulkIds, same contract as CRM's bulk
   * endpoints (crm/bulk-actions.ts).
   */
  @Post('bulk/assign')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkAssign(@Body() dto: BulkAssignCasesDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.case.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((c) => c.id));
    if (matched.length > 0) {
      await prisma.case.updateMany({ where: { id: { in: matched } }, data: { assignedToId: dto.assignedToId } });
      await Promise.all(
        matched.map((id) =>
          enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'ASSIGNED', occurredAt: new Date().toISOString() }).catch(() => undefined),
        ),
      );
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  /**
   * Unlike CRM's bulk/update (a raw updateMany over generic fields), each
   * row here goes through applyCaseStatusTransition individually — status
   * has a real state machine (case-lifecycle.ts) a batch update must not
   * bypass. A row whose current status can't reach `dto.status` fails for
   * that row alone and is reported in `skipped`, never silently applied or
   * left to abort the whole batch.
   */
  @Post('bulk/update')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkUpdate(@Body() dto: BulkUpdateCasesDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.case.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched: visibleIds, skipped: invisible } = diffBulkIds(dto.ids, visible.map((c) => c.id));

    const updated: string[] = [];
    const failed: string[] = [];
    for (const id of visibleIds) {
      try {
        const kase = await applyCaseStatusTransition(id, dto.status);
        updated.push(id);
        await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'STATUS_CHANGED', occurredAt: kase.updatedAt.toISOString() }).catch(() => undefined);
      } catch {
        failed.push(id);
      }
    }
    return { requested: dto.ids, updated, skipped: [...invisible, ...failed] };
  }

  // 'mine'/'queue' must precede ':id' — Nest matches literal segments in
  // declaration order ahead of a dynamic param competing for the same slot.
  @Get('mine')
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: [CaseResponseDto] })
  async listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: CaseQueryDto): Promise<CaseResponseDto[]> {
    return getPrismaClient().case.findMany({
      where: { assignedToId: user.id, status: query.status, priority: query.priority },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Unassigned, still-active cases — the work queue an agent/team pulls from before self-assigning via POST :id/claim. RLS still scopes visibility to what the caller's role/team can see; `teamId` narrows it further, it doesn't widen it. */
  @Get('queue')
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: [CaseResponseDto] })
  async queue(@Query() query: CaseQueueQueryDto): Promise<CaseResponseDto[]> {
    return getPrismaClient().case.findMany({
      where: {
        assignedToId: null,
        status: { in: [...UNASSIGNED_QUEUE_STATUSES] },
        assignedTeamId: query.teamId,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    });
  }

  @Get(':id')
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: CaseResponseDto })
  async getOne(@Param('id') id: string): Promise<CaseResponseDto> {
    const kase = await getPrismaClient().case.findUnique({ where: { id } });
    if (!kase) throw new NotFoundException('Case not found');
    return kase;
  }

  /** Who changed what, and when — see entity-history.ts's header comment for why this needs its own endpoint rather than reusing GET /audit-log. */
  @Get(':id/history')
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: [AuditLogResponseDto] })
  async history(@Param('id') id: string): Promise<AuditLogResponseDto[]> {
    const kase = await getPrismaClient().case.findUnique({ where: { id }, select: { id: true } });
    if (!kase) throw new NotFoundException('Case not found');
    return loadEntityHistory('cases', id);
  }

  /**
   * `createdById` is always the calling user, not client-suppliable — see
   * the schema comment on Case.createdById: without it, a case created
   * with no accountId/assignedToId/assignedTeamId was invisible to its own
   * creator immediately after creation (cases_rw's USING/SELECT policy had
   * no branch for "the person who filed it"), which made this exact
   * `.create()` call fail outright — Postgres's INSERT...RETURNING also
   * enforces the SELECT policy on the new row, not just WITH CHECK.
   * Discovered live via direct Prisma/pg reproduction, not theoretical.
   */
  @Post()
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async create(@Body() dto: CreateCaseDto, @CurrentUser() user: AuthenticatedUser): Promise<Case> {
    const prisma = getPrismaClient();

    // Record<string, unknown> here (not Prisma's generated create-input
    // type) is deliberate — validateBusinessRules mutates this object in
    // place for SET_VALUE actions before it's used as the create payload,
    // and needs a plain indexable shape to do that against an admin-
    // configured field name it can't know statically.
    const data: Record<string, unknown> = {
      caseType: dto.caseType,
      categoryId: dto.categoryId,
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority,
      accountId: dto.accountId,
      contactId: dto.contactId,
      policyId: dto.policyId,
      assignedToId: dto.assignedToId,
      assignedTeamId: dto.assignedTeamId,
      slaPolicyId: dto.slaPolicyId,
      sourceChannel: dto.sourceChannel,
    };
    await validateBusinessRules('CASE', undefined, data);

    let created: Case | undefined;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await prisma.case.create({
          data: {
            ...(data as Prisma.CaseUncheckedCreateInput),
            caseNumber: generateCaseNumber(),
            createdById: user.id,
          },
        });
      } catch (err) {
        if (!isUniqueConstraintViolation(err) || attempt === 2) throw err;
      }
    }
    const kase = created!;

    if (kase.assignedTeamId) {
      await enqueueTeamAssignmentNotification({ caseId: kase.id, teamId: kase.assignedTeamId }).catch(() => undefined);
    }

    await ensureCaseSlaClocks(kase.id, dto.slaPolicyId ?? null, kase.caseType, kase.priority, kase.accountId).catch((err: unknown) => {
      console.error(`[cases] failed to start SLA clocks for case ${kase.id}`, err);
    });

    // Auto-assignment only kicks in when the caller left both fields unset —
    // an explicit assignedToId/assignedTeamId on the request always wins.
    // Never lets a resolver failure fail case creation itself: an
    // unresolved case simply lands in the existing unassigned queue
    // (GET /cases/queue), same resilience contract as ensureCaseSlaClocks
    // above.
    if (!dto.assignedToId && !dto.assignedTeamId) {
      const rule = await findMatchingAssignmentRule('CASE', kase.caseType, kase.priority).catch((err: unknown) => {
        console.error(`[cases] auto-assignment rule lookup failed for case ${kase.id}`, err);
        return null;
      });
      if (rule) {
        const resolution = await resolveNextAssignee(rule, true).catch((err: unknown) => {
          console.error(`[cases] auto-assignment resolution failed for case ${kase.id}`, err);
          return null;
        });
        if (resolution?.userId) {
          await prisma.case.update({
            where: { id: kase.id },
            data: { assignedToId: resolution.userId, assignedTeamId: rule.candidatePoolTeamId },
          });
          await enqueueEntityEvent({ entityType: 'CASE', entityId: kase.id, eventType: 'ASSIGNED', occurredAt: new Date().toISOString() }).catch(() => undefined);
          if (rule.candidatePoolTeamId) {
            await enqueueTeamAssignmentNotification({ caseId: kase.id, teamId: rule.candidatePoolTeamId }).catch(() => undefined);
          }
        }
      }
    }

    await enqueueEntityEvent({ entityType: 'CASE', entityId: kase.id, eventType: 'CREATED', occurredAt: kase.createdAt.toISOString() }).catch(() => undefined);

    // Re-fetch: ensureCaseSlaClocks/auto-assignment may have written fields onto the row.
    return prisma.case.findUniqueOrThrow({ where: { id: kase.id } });
  }

  @Patch(':id')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCaseDto): Promise<CaseResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.case.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Case not found');
    const data: Record<string, unknown> = {
      categoryId: dto.categoryId,
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority,
      accountId: dto.accountId,
      contactId: dto.contactId,
      policyId: dto.policyId,
      assignedToId: dto.assignedToId,
      assignedTeamId: dto.assignedTeamId,
      slaPolicyId: dto.slaPolicyId,
      sourceChannel: dto.sourceChannel,
    };
    await validateBusinessRules('CASE', existing as unknown as Record<string, unknown>, data);
    const updated = await prisma.case.update({
      where: { id },
      data: data as Prisma.CaseUncheckedUpdateInput,
    });
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'UPDATED', occurredAt: updated.updatedAt.toISOString() }).catch(() => undefined);
    if (dto.assignedTeamId && dto.assignedTeamId !== existing.assignedTeamId) {
      await enqueueTeamAssignmentNotification({ caseId: id, teamId: dto.assignedTeamId }).catch(() => undefined);
    }
    return updated;
  }

  /** Self-assign from the unassigned queue — idempotent if the caller already owns it, a 409 if someone else does. */
  @Post(':id/claim')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async claimCase(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<CaseResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.case.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Case not found');
    if (existing.assignedToId === user.id) return existing;

    // Atomic conditional update, not the read-then-write this replaced —
    // the old `findUnique` -> check -> `update({where:{id}})` had a real
    // TOCTOU race: two agents opening the same unassigned ticket at once
    // could both pass the null-check before either wrote, and the second
    // write would silently steal the case with no error to either caller
    // (found live, not theoretical). The `assignedToId: null` guard in the
    // WHERE clause makes only the first writer's update actually match a
    // row; `count === 0` means someone else's write landed first.
    const result = await prisma.case.updateMany({ where: { id, assignedToId: null }, data: { assignedToId: user.id } });
    if (result.count === 0) {
      throw new ConflictException('Case is already assigned to another user');
    }
    const updated = await prisma.case.findUniqueOrThrow({ where: { id } });
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'ASSIGNED', occurredAt: updated.updatedAt.toISOString() }).catch(() => undefined);
    return updated;
  }

  @Post(':id/status')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async changeStatus(@Param('id') id: string, @Body() dto: ChangeCaseStatusDto): Promise<CaseResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.case.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Case not found');
    if (dto.status === 'CLOSED' && existing.caseType === 'COMPLAINT') {
      throw new BadRequestException('Closing a COMPLAINT case requires approval — use POST /cases/:id/request-closure');
    }

    // Deliberately NOT passed into/called from applyCaseStatusTransition
    // itself — that function is shared with the automation engine's
    // SET_STATUS action handler (see status-transition.util.ts), and an
    // unattended automation run has no way to recover from a thrown
    // BadRequestException. Business rule enforcement stays scoped to this
    // user-initiated controller call. `extra` starts as just the
    // candidate new status (so a rule's condition can react to "the
    // status this case is about to have", merged against the case's
    // current — pre-transition — other fields); validateBusinessRules may
    // add further keys via SET_VALUE, applied below via a second update
    // once the transition itself has landed.
    const extra: Record<string, unknown> = { status: dto.status };
    await validateBusinessRules('CASE', existing as unknown as Record<string, unknown>, extra);
    delete extra.status;

    let kase = await applyCaseStatusTransition(id, dto.status, dto.reason);
    if (Object.keys(extra).length > 0) {
      kase = await prisma.case.update({ where: { id }, data: extra as Prisma.CaseUncheckedUpdateInput });
    }
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'STATUS_CHANGED', occurredAt: kase.updatedAt.toISOString() }).catch(() => undefined);
    return kase;
  }

  /**
   * Non-COMPLAINT cases close directly, same as before. COMPLAINT cases
   * instead create a CASE_CLOSURE Approval and notify every
   * COMPLIANCE_OFFICER (in-app + email) — the case's own status is
   * untouched until POST :id/closure-decision actually closes it. See the
   * schema comment on ApprovalEntityType.CASE_CLOSURE.
   */
  @Post(':id/request-closure')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async requestClosure(@Param('id') id: string, @Body() dto: RequestCaseClosureDto, @CurrentUser() user: AuthenticatedUser): Promise<CaseResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.case.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Case not found');

    if (existing.caseType !== 'COMPLAINT') {
      const kase = await applyCaseStatusTransition(id, 'CLOSED', dto.reason);
      await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'STATUS_CHANGED', occurredAt: kase.updatedAt.toISOString() }).catch(() => undefined);
      return kase;
    }

    assertValidCaseTransition(existing.status, 'CLOSED');

    const existingPending = await prisma.approval.findFirst({ where: { entityType: 'CASE_CLOSURE', entityId: id, status: 'PENDING' } });
    if (existingPending) throw new ConflictException('A closure approval is already pending for this case');

    await prisma.approval.create({ data: { entityType: 'CASE_CLOSURE', entityId: id, requestedById: user.id, status: 'PENDING', reason: dto.reason } });

    // notifications_rw's WITH CHECK only allows a caller to create a
    // Notification addressed to THEMSELVES (recipient_user_id =
    // app_current_user_id()) — every other notification-creating path in
    // this codebase runs under SYSTEM_JOB_CONTEXT for exactly this reason
    // (sla-breach-scan, the SEND_NOTIFICATION automation handler). This is
    // the first *interactive* request handler that needs to notify OTHER
    // users as a side effect, so it needs the same escape hatch — same
    // fix, same reasoning, as enqueueSurveyInvitesForResolvedCase's
    // SYSTEM_JOB_CONTEXT wrap (survey-dispatch-queue.ts).
    const complianceOfficers = await prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { name: 'COMPLIANCE_OFFICER' } } } },
    });
    await runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      for (const officer of complianceOfficers) {
        for (const channel of ['IN_APP', 'EMAIL'] as const) {
          await prisma.notification
            .create({
              data: {
                recipientUserId: officer.id,
                type: 'CASE_CLOSURE_APPROVAL_REQUESTED',
                title: `Closure approval needed: ${existing.caseNumber}`,
                body: `${user.fullName} requested closure approval for complaint case ${existing.caseNumber} — ${existing.subject}.`,
                relatedEntityType: 'CASE',
                relatedEntityId: id,
                channel,
                status: 'PENDING',
                dedupeKey: `case-closure-approval:${id}:${officer.id}:${channel}`,
              },
            })
            .catch((err: unknown) => {
              if (!isUniqueConstraintViolation(err)) throw err;
            });
        }
      }
    });

    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'CLOSURE_REQUESTED', occurredAt: new Date().toISOString() }).catch(() => undefined);
    return existing;
  }

  /**
   * Decides a pending CASE_CLOSURE approval — mirrors
   * KnowledgeArticlesService.decideApproval() exactly (segregation of
   * duties, then apply the entity-specific effect inline).
   */
  @Post(':id/closure-decision')
  @RequirePermission('approval', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async decideClosure(@Param('id') id: string, @Body() dto: DecideCaseClosureDto, @CurrentUser() user: AuthenticatedUser): Promise<CaseResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.case.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Case not found');

    const approval = await prisma.approval.findFirst({ where: { entityType: 'CASE_CLOSURE', entityId: id, status: 'PENDING' } });
    if (!approval) throw new NotFoundException('No pending closure approval for this case');
    // Segregation of duties — the approvals_requester_ne_approver DB CHECK
    // would also reject this, but a clear 403 here beats a raw constraint
    // violation surfacing as a 500 (same reasoning as the KnowledgeArticle
    // publish-decision endpoint this mirrors).
    if (approval.requestedById === user.id) {
      throw new ForbiddenException('Cannot decide your own closure request');
    }

    if (dto.decision === 'APPROVED') {
      await prisma.approval.update({ where: { id: approval.id }, data: { status: 'APPROVED', approvedById: user.id, decidedAt: new Date(), reason: dto.reason } });
      const kase = await applyCaseStatusTransition(id, 'CLOSED', dto.reason);
      await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'CLOSURE_APPROVED', occurredAt: kase.updatedAt.toISOString() }).catch(() => undefined);
      return kase;
    }

    await prisma.approval.update({ where: { id: approval.id }, data: { status: 'REJECTED', approvedById: user.id, decidedAt: new Date(), reason: dto.reason } });
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'CLOSURE_REJECTED', occurredAt: new Date().toISOString() }).catch(() => undefined);
    return existing;
  }

  @Get(':id/closure-approval')
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: CaseClosureApprovalResponseDto })
  async getClosureApproval(@Param('id') id: string): Promise<CaseClosureApprovalResponseDto | null> {
    return getPrismaClient().approval.findFirst({
      where: { entityType: 'CASE_CLOSURE', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/link-child')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async linkChild(@Param('id') id: string, @Body() dto: LinkChildCaseDto): Promise<CaseResponseDto> {
    if (dto.childCaseId === id) throw new BadRequestException('A case cannot be linked as its own child');
    const prisma = getPrismaClient();
    const [parent, child] = await Promise.all([
      prisma.case.findUnique({ where: { id } }),
      prisma.case.findUnique({ where: { id: dto.childCaseId } }),
    ]);
    if (!parent) throw new NotFoundException('Case not found');
    if (!child) throw new NotFoundException('childCaseId not found');
    await prisma.case.update({ where: { id: dto.childCaseId }, data: { parentCaseId: id, linkType: 'PARENT_CHILD' } });
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'CHILD_LINKED', occurredAt: new Date().toISOString() }).catch(() => undefined);
    return parent;
  }

  /**
   * Non-destructive merge (see the schema's own doc comment: "MERGED is
   * just a link-type value on a reversible parent/child relationship" —
   * unlike Zendesk's permanent ticket merge). The case at :id becomes a
   * MERGED child of targetCaseId; any of its own children are reparented to
   * the target first so no case is orphaned. Reparenting the children and
   * updating the loser are two independent sequential writes (per this
   * module's $transaction-avoidance discipline, see leads.controller.ts's
   * convert()) — a failure partway through leaves some children reparented
   * and others not, which is safe to simply retry (each individual update
   * is idempotent), not a state that needs manual compensation.
   */
  @Post(':id/merge')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async merge(@Param('id') id: string, @Body() dto: MergeCaseDto): Promise<CaseResponseDto> {
    if (dto.targetCaseId === id) throw new BadRequestException('A case cannot be merged into itself');
    const prisma = getPrismaClient();
    const [loser, target] = await Promise.all([
      prisma.case.findUnique({ where: { id } }),
      prisma.case.findUnique({ where: { id: dto.targetCaseId } }),
    ]);
    if (!loser) throw new NotFoundException('Case not found');
    if (!target) throw new NotFoundException('targetCaseId not found');

    const children = await prisma.case.findMany({ where: { parentCaseId: id } });
    for (const child of children) {
      await prisma.case.update({ where: { id: child.id }, data: { parentCaseId: dto.targetCaseId } });
    }

    // Direct status write, not applyCaseStatusTransition: a merge is an
    // administrative override outside the normal workflow state machine
    // (e.g. a REOPENED case, which CASE_STATUS_TRANSITIONS does not allow
    // moving directly to CLOSED, must still be mergeable).
    const merged = await prisma.case.update({
      where: { id },
      data: { parentCaseId: dto.targetCaseId, linkType: 'MERGED', status: 'CLOSED', closedAt: new Date() },
    });
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'MERGED', occurredAt: merged.updatedAt.toISOString() }).catch(() => undefined);
    return merged;
  }

  @Post(':id/apply-macro/:macroId')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: ApplyMacroResponseDto })
  async applyMacro(@Param('id') id: string, @Param('macroId') macroId: string, @CurrentUser() user: AuthenticatedUser): Promise<ApplyMacroResponseDto> {
    const existing = await getPrismaClient().case.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Case not found');
    const results = await this.macros.apply(macroId, 'CASE', id, user.id);
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'MACRO_APPLIED', occurredAt: new Date().toISOString() }).catch(() => undefined);
    return { macroId, entityType: 'CASE', entityId: id, results };
  }

  @Get(':id/comments')
  @RequirePermission('activity', 'read')
  @ApiOkResponse({ type: [CommentResponseDto] })
  async listComments(@Param('id') id: string): Promise<CommentResponseDto[]> {
    return this.comments.list({ caseId: id });
  }

  @Post(':id/comments')
  @RequirePermission('activity', 'write')
  @ApiOkResponse({ type: CommentResponseDto })
  async addComment(@Param('id') id: string, @Body() dto: CreateCommentDto, @CurrentUser() user: AuthenticatedUser): Promise<CommentResponseDto> {
    return this.comments.create({ caseId: id }, dto, user.id);
  }

  @Get(':id/watchers')
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: [CaseWatcherResponseDto] })
  async listWatchers(@Param('id') id: string): Promise<CaseWatcherResponseDto[]> {
    return this.watchers.list({ caseId: id });
  }

  @Post(':id/watchers')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseWatcherResponseDto })
  async addWatcher(@Param('id') id: string, @Body() dto: AddWatcherDto): Promise<CaseWatcherResponseDto> {
    return this.watchers.add({ caseId: id }, dto.userId);
  }

  @Delete(':id/watchers/:userId')
  @RequirePermission('case', 'write')
  async removeWatcher(@Param('id') id: string, @Param('userId') userId: string): Promise<{ deleted: boolean }> {
    await this.watchers.remove({ caseId: id }, userId);
    return { deleted: true };
  }
}

import { randomBytes } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma, type Case } from '@topiadesk/db';
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
import { applyCaseStatusTransition } from './status-transition.util';
import { ensureCaseSlaClocks } from './sla-clock.util';
import { enqueueEntityEvent } from './automation-events.util';

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
  async list(@Query() query: CaseQueryDto): Promise<CaseResponseDto[]> {
    return getPrismaClient().case.findMany({
      where: {
        status: query.status,
        priority: query.priority,
        caseType: query.caseType,
        assignedToId: query.assignedToId,
        assignedTeamId: query.assignedTeamId,
        accountId: query.accountId,
        categoryId: query.categoryId,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
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

    let created: Case | undefined;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await prisma.case.create({
          data: {
            caseNumber: generateCaseNumber(),
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
            createdById: user.id,
            slaPolicyId: dto.slaPolicyId,
            sourceChannel: dto.sourceChannel,
          },
        });
      } catch (err) {
        if (!isUniqueConstraintViolation(err) || attempt === 2) throw err;
      }
    }
    const kase = created!;

    await ensureCaseSlaClocks(kase.id, dto.slaPolicyId ?? null, kase.caseType, kase.priority).catch((err: unknown) => {
      console.error(`[cases] failed to start SLA clocks for case ${kase.id}`, err);
    });
    await enqueueEntityEvent({ entityType: 'CASE', entityId: kase.id, eventType: 'CREATED', occurredAt: kase.createdAt.toISOString() }).catch(() => undefined);

    // Re-fetch: ensureCaseSlaClocks may have written a resolved slaPolicyId onto the row.
    return prisma.case.findUniqueOrThrow({ where: { id: kase.id } });
  }

  @Patch(':id')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCaseDto): Promise<CaseResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.case.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Case not found');
    const updated = await prisma.case.update({
      where: { id },
      data: {
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
      },
    });
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'UPDATED', occurredAt: updated.updatedAt.toISOString() }).catch(() => undefined);
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
    if (existing.assignedToId && existing.assignedToId !== user.id) {
      throw new ConflictException('Case is already assigned to another user');
    }
    if (existing.assignedToId === user.id) return existing;
    const updated = await prisma.case.update({ where: { id }, data: { assignedToId: user.id } });
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'ASSIGNED', occurredAt: updated.updatedAt.toISOString() }).catch(() => undefined);
    return updated;
  }

  @Post(':id/status')
  @RequirePermission('case', 'write')
  @ApiOkResponse({ type: CaseResponseDto })
  async changeStatus(@Param('id') id: string, @Body() dto: ChangeCaseStatusDto): Promise<CaseResponseDto> {
    const kase = await applyCaseStatusTransition(id, dto.status, dto.reason);
    await enqueueEntityEvent({ entityType: 'CASE', entityId: id, eventType: 'STATUS_CHANGED', occurredAt: kase.updatedAt.toISOString() }).catch(() => undefined);
    return kase;
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

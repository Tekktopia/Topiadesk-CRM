import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Claim } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { decimalToString } from '../policy/decimal.util';
// NOT type-only imports: both services are constructor-injected below —
// Nest's DI resolves constructor parameter types via emitDecoratorMetadata's
// design:paramtypes, which needs the real class reference at runtime (same
// footgun documented in permission.guard.ts and documents.controller.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CommentsService } from './comments.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { WatchersService } from './watchers.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MacrosService } from './macros.service';
import {
  BulkAssignClaimsDto,
  BulkUpdateClaimsDto,
  ChangeClaimStatusDto,
  ClaimQueryDto,
  ClaimResponseDto,
  ClaimStatusHistoryResponseDto,
  CreateClaimDto,
  ReopenClaimDto,
  UpdateClaimDto,
} from './dto/claim.dto';
import { AddWatcherDto, CaseWatcherResponseDto } from './dto/case-watcher.dto';
import { CommentResponseDto, CreateCommentDto } from './dto/comment.dto';
import { ApplyMacroResponseDto } from './dto/macro.dto';
import { BulkActionResponseDto } from './dto/bulk-action.dto';
import { applyClaimStatusTransition } from './status-transition.util';
import { ensureClaimSlaClocks } from './sla-clock.util';
import { enqueueEntityEvent } from './automation-events.util';
import { diffBulkIds } from './bulk-actions';

function toClaimDto(claim: Claim): ClaimResponseDto {
  return { ...claim, reserveAmount: decimalToString(claim.reserveAmount), settledAmount: decimalToString(claim.settledAmount) };
}

/**
 * Claims are a separate, strongly-typed table from Case (see the schema's
 * Phase 2 Case Management doc comment) — money-movement fields
 * (reserveAmount/settledAmount) and a regulator-facing lifecycle
 * (claim-lifecycle.ts) that don't fit a generic ticket. All access goes
 * through `getPrismaClient()` inside the RLS context RlsContextMiddleware
 * binds per request — visibility is scoped via adjuster_id or the linked
 * Policy's Account owner (prisma/rls/002_policies.sql's claims_rw); no
 * manual WHERE filtering here for that.
 */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('claims')
export class ClaimsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly watchers: WatchersService,
    private readonly macros: MacrosService,
  ) {}

  @Get()
  @RequirePermission('claim', 'read')
  @ApiOkResponse({ type: [ClaimResponseDto] })
  async list(@Query() query: ClaimQueryDto): Promise<ClaimResponseDto[]> {
    const claims = await getPrismaClient().claim.findMany({
      where: {
        status: query.status,
        priority: query.priority,
        adjusterId: query.adjusterId,
        policyId: query.policyId,
        assignedTeamId: query.assignedTeamId,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return claims.map(toClaimDto);
  }

  // Must precede ':id' — Nest matches literal segments in declaration order
  // ahead of a dynamic param competing for the same position.
  @Get('mine')
  @RequirePermission('claim', 'read')
  @ApiOkResponse({ type: [ClaimResponseDto] })
  async listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: ClaimQueryDto): Promise<ClaimResponseDto[]> {
    const claims = await getPrismaClient().claim.findMany({
      where: { adjusterId: user.id, status: query.status, priority: query.priority },
      orderBy: { createdAt: 'desc' },
    });
    return claims.map(toClaimDto);
  }

  /** Real bulk endpoints — see cases.controller.ts's bulkAssign/bulkUpdate header comment for the full rationale (same "no bulk/* endpoint exists, client fanned out N requests" gap, same fix, mirrored here). */
  @Post('bulk/assign')
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkAssign(@Body() dto: BulkAssignClaimsDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.claim.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((c) => c.id));
    if (matched.length > 0) {
      await prisma.claim.updateMany({ where: { id: { in: matched } }, data: { adjusterId: dto.adjusterId } });
      await Promise.all(
        matched.map((id) =>
          enqueueEntityEvent({ entityType: 'CLAIM', entityId: id, eventType: 'UPDATED', occurredAt: new Date().toISOString() }).catch(() => undefined),
        ),
      );
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  /** Each row goes through applyClaimStatusTransition individually (claim-lifecycle.ts's real state machine) — same reasoning as cases.controller.ts's bulkUpdate. */
  @Post('bulk/update')
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkUpdate(@Body() dto: BulkUpdateClaimsDto, @CurrentUser() user: AuthenticatedUser): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.claim.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched: visibleIds, skipped: invisible } = diffBulkIds(dto.ids, visible.map((c) => c.id));

    const updated: string[] = [];
    const failed: string[] = [];
    for (const id of visibleIds) {
      try {
        const claim = await applyClaimStatusTransition(id, dto.status, user.id);
        updated.push(id);
        await enqueueEntityEvent({ entityType: 'CLAIM', entityId: id, eventType: 'STATUS_CHANGED', occurredAt: claim.updatedAt.toISOString() }).catch(() => undefined);
      } catch {
        failed.push(id);
      }
    }
    return { requested: dto.ids, updated, skipped: [...invisible, ...failed] };
  }

  @Get(':id')
  @RequirePermission('claim', 'read')
  @ApiOkResponse({ type: ClaimResponseDto })
  async getOne(@Param('id') id: string): Promise<ClaimResponseDto> {
    const claim = await getPrismaClient().claim.findUnique({ where: { id } });
    if (!claim) throw new NotFoundException('Claim not found');
    return toClaimDto(claim);
  }

  @Get(':id/status-history')
  @RequirePermission('claim', 'read')
  @ApiOkResponse({ type: [ClaimStatusHistoryResponseDto] })
  async statusHistory(@Param('id') id: string): Promise<ClaimStatusHistoryResponseDto[]> {
    return getPrismaClient().claimStatusHistory.findMany({ where: { claimId: id }, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: ClaimResponseDto })
  async create(@Body() dto: CreateClaimDto): Promise<ClaimResponseDto> {
    const prisma = getPrismaClient();
    const claim = await prisma.claim.create({
      data: {
        claimNumber: dto.claimNumber,
        policyId: dto.policyId,
        priority: dto.priority,
        dateOfLoss: new Date(dto.dateOfLoss),
        dateReported: dto.dateReported ? new Date(dto.dateReported) : undefined,
        causeOfLoss: dto.causeOfLoss,
        causeOfLossCategoryId: dto.causeOfLossCategoryId,
        reserveAmount: dto.reserveAmount,
        adjusterId: dto.adjusterId,
        assignedTeamId: dto.assignedTeamId,
        slaPolicyId: dto.slaPolicyId,
        catastropheEventId: dto.catastropheEventId,
        parentClaimId: dto.parentClaimId,
        externalAdjusterRef: dto.externalAdjusterRef,
      },
    });

    // SLA clock creation and the automation-event enqueue are both additive
    // side effects of a claim that already exists — neither failing should
    // fail the create itself, so both are best-effort/logged, not awaited
    // inside the same failure path as the write above. Claim has no direct
    // accountId (only reachable via Policy) — one cheap indexed lookup for
    // the account-level SLA override check in ensureClaimSlaClocks.
    const claimPolicy = await prisma.policy.findUnique({ where: { id: dto.policyId }, select: { accountId: true } });
    await ensureClaimSlaClocks(claim.id, dto.slaPolicyId ?? null, claim.priority, claim.status, claimPolicy?.accountId).catch((err: unknown) => {
      console.error(`[claims] failed to start SLA clocks for claim ${claim.id}`, err);
    });
    await enqueueEntityEvent({ entityType: 'CLAIM', entityId: claim.id, eventType: 'CREATED', occurredAt: claim.createdAt.toISOString() }).catch(() => undefined);

    // Re-fetch: ensureClaimSlaClocks may have written a resolved slaPolicyId onto the row.
    const fresh = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    return toClaimDto(fresh);
  }

  @Patch(':id')
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: ClaimResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateClaimDto): Promise<ClaimResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.claim.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Claim not found');
    const claim = await prisma.claim.update({
      where: { id },
      data: {
        priority: dto.priority,
        causeOfLoss: dto.causeOfLoss,
        causeOfLossCategoryId: dto.causeOfLossCategoryId,
        reserveAmount: dto.reserveAmount,
        settledAmount: dto.settledAmount,
        repudiationReason: dto.repudiationReason,
        adjusterId: dto.adjusterId,
        assignedTeamId: dto.assignedTeamId,
        catastropheEventId: dto.catastropheEventId,
        externalAdjusterRef: dto.externalAdjusterRef,
      },
    });
    await enqueueEntityEvent({ entityType: 'CLAIM', entityId: id, eventType: 'UPDATED', occurredAt: claim.updatedAt.toISOString() }).catch(() => undefined);
    return toClaimDto(claim);
  }

  @Post(':id/status')
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: ClaimResponseDto })
  async changeStatus(@Param('id') id: string, @Body() dto: ChangeClaimStatusDto, @CurrentUser() user: AuthenticatedUser): Promise<ClaimResponseDto> {
    const claim = await applyClaimStatusTransition(id, dto.status, user.id, dto.reason, { settledAmount: dto.settledAmount });
    await enqueueEntityEvent({ entityType: 'CLAIM', entityId: id, eventType: 'STATUS_CHANGED', occurredAt: claim.updatedAt.toISOString() }).catch(() => undefined);
    return toClaimDto(claim);
  }

  @Post(':id/reopen')
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: ClaimResponseDto })
  async reopen(@Param('id') id: string, @Body() dto: ReopenClaimDto, @CurrentUser() user: AuthenticatedUser): Promise<ClaimResponseDto> {
    const claim = await applyClaimStatusTransition(id, 'REOPENED', user.id, dto.reason);
    await enqueueEntityEvent({ entityType: 'CLAIM', entityId: id, eventType: 'STATUS_CHANGED', occurredAt: claim.updatedAt.toISOString() }).catch(() => undefined);
    return toClaimDto(claim);
  }

  /**
   * Mirrors CasesController.applyMacro exactly — Macro.entityType already
   * supported CLAIM in the schema, but this endpoint (the only way to
   * actually apply one) didn't exist, so a CLAIM-scoped macro could be
   * created and previewed but never applied anywhere.
   */
  @Post(':id/apply-macro/:macroId')
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: ApplyMacroResponseDto })
  async applyMacro(@Param('id') id: string, @Param('macroId') macroId: string, @CurrentUser() user: AuthenticatedUser): Promise<ApplyMacroResponseDto> {
    const existing = await getPrismaClient().claim.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Claim not found');
    const results = await this.macros.apply(macroId, 'CLAIM', id, user.id);
    await enqueueEntityEvent({ entityType: 'CLAIM', entityId: id, eventType: 'MACRO_APPLIED', occurredAt: new Date().toISOString() }).catch(() => undefined);
    return { macroId, entityType: 'CLAIM', entityId: id, results };
  }

  @Get(':id/comments')
  @RequirePermission('activity', 'read')
  @ApiOkResponse({ type: [CommentResponseDto] })
  async listComments(@Param('id') id: string): Promise<CommentResponseDto[]> {
    return this.comments.list({ claimId: id });
  }

  @Post(':id/comments')
  @RequirePermission('activity', 'write')
  @ApiOkResponse({ type: CommentResponseDto })
  async addComment(@Param('id') id: string, @Body() dto: CreateCommentDto, @CurrentUser() user: AuthenticatedUser): Promise<CommentResponseDto> {
    return this.comments.create({ claimId: id }, dto, user.id);
  }

  @Get(':id/watchers')
  @RequirePermission('claim', 'read')
  @ApiOkResponse({ type: [CaseWatcherResponseDto] })
  async listWatchers(@Param('id') id: string): Promise<CaseWatcherResponseDto[]> {
    return this.watchers.list({ claimId: id });
  }

  @Post(':id/watchers')
  @RequirePermission('claim', 'write')
  @ApiOkResponse({ type: CaseWatcherResponseDto })
  async addWatcher(@Param('id') id: string, @Body() dto: AddWatcherDto): Promise<CaseWatcherResponseDto> {
    return this.watchers.add({ claimId: id }, dto.userId);
  }

  @Delete(':id/watchers/:userId')
  @RequirePermission('claim', 'write')
  async removeWatcher(@Param('id') id: string, @Param('userId') userId: string): Promise<{ deleted: boolean }> {
    await this.watchers.remove({ claimId: id }, userId);
    return { deleted: true };
  }
}

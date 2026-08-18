import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
// NOT type-only: AuditService is constructor-injected, so Nest needs it as a
// runtime value to resolve the dependency. `eslint --fix` would convert this
// to `import type` and break DI at boot — the same footgun documented on
// Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from '../../common/audit/audit.service';
// NOT type-only: these are @Query()/@Body() parameter types, so Nest needs
// them as runtime values for ValidationPipe to resolve the metatype.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  BOOK_ENTITIES,
  type BookEntity,
  BookCountsDto,
  BookPreviewQueryDto,
  BookTransferResultDto,
  TransferBookDto,
} from './dto/book-transfer.dto';

/**
 * Whole-book handover between producers.
 *
 * Single-account ownership transfer already existed, and bulk owner-assign
 * could move a hand-picked selection — but neither answers the case that
 * actually happens: a producer leaves, and their entire portfolio has to
 * move to a colleague. Doing that record by record across accounts,
 * opportunities, leads, tasks and renewal schedules is the manual exercise
 * a brokerage of SCIB's size cannot afford to repeat.
 *
 * Gated on 'account':'write' at ALL scope in practice — moving someone
 * else's whole book is a management action, and RLS on each table still
 * decides which rows the caller can actually see and update, so a broker
 * running this only ever moves rows already visible to them.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/book-transfer')
export class BookTransferController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * What would move, before anyone commits to moving it. A handover dialog
   * that says "this will move 412 accounts and 88 opportunities" is the
   * difference between a considered action and a surprise.
   */
  @Get('preview')
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: BookCountsDto })
  async preview(@Query() query: BookPreviewQueryDto): Promise<BookCountsDto> {
    return countBook(query.fromUserId);
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: BookTransferResultDto })
  async transfer(@Body() dto: TransferBookDto): Promise<BookTransferResultDto> {
    if (dto.fromUserId === dto.toUserId) {
      throw new BadRequestException('The departing and receiving user are the same person.');
    }
    const prisma = getPrismaClient();
    const [from, to] = await Promise.all([
      prisma.user.findUnique({ where: { id: dto.fromUserId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: dto.toUserId }, select: { id: true, status: true } }),
    ]);
    if (!from) throw new NotFoundException('Departing user not found');
    if (!to) throw new NotFoundException('Receiving user not found');
    // Handing a book to a deactivated account would silently orphan it — the
    // rows would move somewhere nobody can act on.
    if (to.status !== 'ACTIVE') throw new BadRequestException('The receiving user is not active.');

    const entities = new Set<BookEntity>(dto.entities ?? [...BOOK_ENTITIES]);
    const moved: BookCountsDto = { accounts: 0, opportunities: 0, leads: 0, tasks: 0, renewals: 0, total: 0 };

    // Sequential rather than parallel: each updateMany fires the audit
    // trigger per affected row, and running five bulk writes concurrently
    // against the same connection buys nothing at these row counts while
    // making a partial failure harder to reason about.
    if (entities.has('accounts')) {
      const r = await prisma.account.updateMany({ where: { ownerId: dto.fromUserId }, data: { ownerId: dto.toUserId } });
      moved.accounts = r.count;
    }
    if (entities.has('opportunities')) {
      const r = await prisma.opportunity.updateMany({ where: { ownerId: dto.fromUserId }, data: { ownerId: dto.toUserId } });
      moved.opportunities = r.count;
    }
    if (entities.has('leads')) {
      const r = await prisma.lead.updateMany({ where: { assignedToId: dto.fromUserId }, data: { assignedToId: dto.toUserId } });
      moved.leads = r.count;
    }
    if (entities.has('tasks')) {
      // Open work only. A completed task is a record of who did it — moving
      // it would rewrite history and distort every activity report.
      const r = await prisma.task.updateMany({
        where: { assigneeId: dto.fromUserId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        data: { assigneeId: dto.toUserId },
      });
      moved.tasks = r.count;
    }
    if (entities.has('renewals')) {
      const r = await prisma.renewalSchedule.updateMany({
        where: { assignedToId: dto.fromUserId },
        data: { assignedToId: dto.toUserId },
      });
      moved.renewals = r.count;
    }
    moved.total = moved.accounts + moved.opportunities + moved.leads + moved.tasks + moved.renewals;

    // One audit record for the handover as a whole. The per-row triggers
    // already capture each individual change; this is the record that
    // explains WHY several hundred rows changed owner at the same instant.
    await this.auditService.recordEvent({
      action: 'OWNERSHIP_TRANSFERRED',
      entityType: 'user_book',
      entityId: dto.fromUserId,
      changedFields: {
        fromUserId: dto.fromUserId,
        toUserId: dto.toUserId,
        entities: [...entities],
        moved,
        reason: dto.reason ?? null,
      },
    });

    return { fromUserId: dto.fromUserId, toUserId: dto.toUserId, moved };
  }
}

/** Shared by preview() and the transfer's own reporting so the two agree. */
async function countBook(userId: string): Promise<BookCountsDto> {
  const prisma = getPrismaClient();
  const [accounts, opportunities, leads, tasks, renewals] = await Promise.all([
    prisma.account.count({ where: { ownerId: userId } }),
    prisma.opportunity.count({ where: { ownerId: userId } }),
    prisma.lead.count({ where: { assignedToId: userId } }),
    prisma.task.count({ where: { assigneeId: userId, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.renewalSchedule.count({ where: { assignedToId: userId } }),
  ]);
  return {
    accounts,
    opportunities,
    leads,
    tasks,
    renewals,
    total: accounts + opportunities + leads + tasks + renewals,
  };
}

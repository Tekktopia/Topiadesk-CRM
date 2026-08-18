import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
// NOT type-only: these are @Query()/@Body() parameter types — Nest needs
// them as runtime values for ValidationPipe to resolve the metatype.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AssignAccountsToTerritoryDto,
  CreateTerritoryDto,
  TerritoryQueryDto,
  TerritoryResponseDto,
  TerritoryStatsResponseDto,
  UpdateTerritoryDto,
} from './dto/territory.dto';

/**
 * Territories — named books of business.
 *
 * Per-account ownership already existed, and book-transfer.controller.ts
 * moves a whole portfolio between people. What was missing is the durable
 * structure around that: a book with a name, a manager, the producers who
 * work it, and a hierarchy so a branch rolls up into a region. Without it a
 * "book" is only whichever accounts happen to share an owner today, which
 * evaporates the moment that person leaves.
 *
 * Reads are open to any authenticated user (a producer must be able to see
 * which book a client sits in); writes are gated on the dedicated
 * 'territory' resource at ALL scope. That split is deliberate — reusing
 * 'account':'write' would have let any broker, who holds it at OWN scope,
 * redraw the firm's entire book structure.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/territories')
export class TerritoriesController {
  @Get()
  @ApiOkResponse({ type: [TerritoryResponseDto] })
  async list(@Query() query: TerritoryQueryDto): Promise<TerritoryResponseDto[]> {
    const territories = await getPrismaClient().territory.findMany({
      where: territoryWhere(query),
      include: {
        parent: { select: { name: true } },
        manager: { select: { fullName: true } },
        members: { include: { user: { select: { id: true, fullName: true } } } },
        _count: { select: { accounts: true } },
      },
      orderBy: { name: 'asc' },
      take: query.take ?? 200,
    });
    return territories.map(toResponse);
  }

  /** Must precede ':id' — Nest matches literal segments in declaration order. */
  @Get('stats')
  @ApiOkResponse({ type: TerritoryStatsResponseDto })
  async stats(@Query() query: TerritoryQueryDto): Promise<TerritoryStatsResponseDto> {
    const prisma = getPrismaClient();
    const where = territoryWhere(query);

    const [total, active, withoutMembers, assignedAccounts, unassignedAccounts] = await Promise.all([
      prisma.territory.count({ where }),
      prisma.territory.count({ where: { AND: [where, { isActive: true }] } }),
      prisma.territory.count({ where: { AND: [where, { members: { none: {} } }] } }),
      prisma.account.count({ where: { isArchived: false, territoryId: { not: null } } }),
      prisma.account.count({ where: { isArchived: false, territoryId: null } }),
    ]);

    return { total, active, withoutMembers, assignedAccounts, unassignedAccounts };
  }

  @Get(':id')
  @ApiOkResponse({ type: TerritoryResponseDto })
  async getOne(@Param('id') id: string): Promise<TerritoryResponseDto> {
    const territory = await getPrismaClient().territory.findUnique({
      where: { id },
      include: {
        parent: { select: { name: true } },
        manager: { select: { fullName: true } },
        members: { include: { user: { select: { id: true, fullName: true } } } },
        _count: { select: { accounts: true } },
      },
    });
    if (!territory) throw new NotFoundException('Territory not found');
    return toResponse(territory);
  }

  @Post()
  @RequirePermission('territory', 'write')
  @ApiOkResponse({ type: TerritoryResponseDto })
  async create(@Body() dto: CreateTerritoryDto): Promise<TerritoryResponseDto> {
    const prisma = getPrismaClient();
    if (dto.parentId) await assertParentExists(dto.parentId);
    const created = await prisma.territory.create({
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        parentId: dto.parentId,
        managerId: dto.managerId,
        members: dto.memberIds?.length ? { create: dto.memberIds.map((userId) => ({ userId })) } : undefined,
      },
      select: { id: true },
    });
    return this.getOne(created.id);
  }

  @Patch(':id')
  @RequirePermission('territory', 'write')
  @ApiOkResponse({ type: TerritoryResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateTerritoryDto): Promise<TerritoryResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.territory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Territory not found');

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) throw new BadRequestException('A territory cannot be its own parent.');
      await assertParentExists(dto.parentId);
      await assertNoCycle(id, dto.parentId);
    }

    await prisma.territory.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        parentId: dto.parentId,
        managerId: dto.managerId,
        isActive: dto.isActive === undefined ? undefined : dto.isActive === 'true',
      },
    });

    // Wholesale replacement when supplied — a partial member diff would need
    // its own add/remove endpoints, and "here is the team now" is how this is
    // actually edited in the UI.
    if (dto.memberIds) {
      await prisma.territoryMember.deleteMany({ where: { territoryId: id } });
      if (dto.memberIds.length > 0) {
        await prisma.territoryMember.createMany({
          data: dto.memberIds.map((userId) => ({ territoryId: id, userId })),
          skipDuplicates: true,
        });
      }
    }

    return this.getOne(id);
  }

  /**
   * Place accounts into this book. Bulk because populating a territory one
   * client at a time is exactly the manual exercise territories exist to end.
   */
  @Post(':id/accounts')
  @RequirePermission('territory', 'write')
  @ApiOkResponse({ type: Number })
  async assignAccounts(@Param('id') id: string, @Body() dto: AssignAccountsToTerritoryDto): Promise<{ assigned: number }> {
    const prisma = getPrismaClient();
    const territory = await prisma.territory.findUnique({ where: { id }, select: { id: true } });
    if (!territory) throw new NotFoundException('Territory not found');
    // RLS still decides which of these ids the caller can actually update, so
    // the count returned is what really moved, not what was requested.
    const result = await prisma.account.updateMany({ where: { id: { in: dto.accountIds } }, data: { territoryId: id } });
    return { assigned: result.count };
  }

  @Delete(':id')
  @RequirePermission('territory', 'write')
  async remove(@Param('id') id: string): Promise<{ deactivated: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.territory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Territory not found');
    // Soft-disable, never a hard delete: accounts keep pointing at a retired
    // territory so historical reporting stays readable, and a child territory
    // would otherwise be silently orphaned.
    await prisma.territory.update({ where: { id }, data: { isActive: false } });
    return { deactivated: true };
  }
}

type TerritoryWithRelations = Prisma.TerritoryGetPayload<{
  include: {
    parent: { select: { name: true } };
    manager: { select: { fullName: true } };
    members: { include: { user: { select: { id: true; fullName: true } } } };
    _count: { select: { accounts: true } };
  };
}>;

function toResponse(t: TerritoryWithRelations): TerritoryResponseDto {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    type: t.type,
    parentId: t.parentId,
    parentName: t.parent?.name ?? null,
    managerId: t.managerId,
    managerName: t.manager?.fullName ?? null,
    isActive: t.isActive,
    members: t.members.map((m) => ({ userId: m.user.id, fullName: m.user.fullName })),
    accountCount: t._count.accounts,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

async function assertParentExists(parentId: string): Promise<void> {
  const parent = await getPrismaClient().territory.findUnique({ where: { id: parentId }, select: { id: true } });
  if (!parent) throw new NotFoundException('Parent territory not found');
}

/**
 * Walks up from the proposed parent looking for `id`. Without this, setting
 * A's parent to its own descendant produces a detached ring that every
 * hierarchy read then loops on forever. Bounded by a depth cap so a
 * pre-existing cycle in the data can't hang this check itself.
 */
async function assertNoCycle(id: string, proposedParentId: string): Promise<void> {
  const prisma = getPrismaClient();
  let cursor: string | null = proposedParentId;
  for (let depth = 0; depth < 50 && cursor; depth += 1) {
    if (cursor === id) throw new BadRequestException('That parent would create a loop in the territory hierarchy.');
    const next: { parentId: string | null } | null = await prisma.territory.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = next?.parentId ?? null;
  }
}

/** Shared by list() and stats() so the header and the table always agree. */
function territoryWhere(query: TerritoryQueryDto): Prisma.TerritoryWhereInput {
  return {
    type: query.type,
    managerId: query.managerId,
    isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
    ...(query.memberId ? { members: { some: { userId: query.memberId } } } : {}),
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
  };
}

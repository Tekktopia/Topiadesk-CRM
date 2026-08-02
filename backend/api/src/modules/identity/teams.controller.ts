import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AddTeamMemberDto, CreateTeamDto, TeamMemberResponseDto, TeamResponseDto, UpdateTeamDto, UpdateTeamMemberDto } from './dto/team.dto';
import { rethrowAsHttpException } from './prisma-error.util';

const MEMBER_WITH_USER_INCLUDE = { user: { select: { id: true, fullName: true, email: true } } } satisfies Prisma.TeamMemberInclude;

type TeamMemberWithUser = Prisma.TeamMemberGetPayload<{ include: typeof MEMBER_WITH_USER_INCLUDE }>;

function toMemberResponse(member: TeamMemberWithUser): TeamMemberResponseDto {
  return {
    id: member.id,
    teamId: member.teamId,
    userId: member.userId,
    userFullName: member.user.fullName,
    userEmail: member.user.email,
    role: member.role,
    createdAt: member.createdAt,
  };
}

/** Team/TeamMember — additive visibility-grant grouping (see TeamMember's schema.prisma comment), not a 3rd nested RLS level; plain admin CRUD. */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/teams')
export class TeamsController {
  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [TeamResponseDto] })
  async list(): Promise<TeamResponseDto[]> {
    const teams = await getPrismaClient().team.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
    return teams.map((t) => ({ id: t.id, name: t.name, description: t.description, createdAt: t.createdAt, memberCount: t._count.members }));
  }

  @Get(':id')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: TeamResponseDto })
  async get(@Param('id') id: string): Promise<TeamResponseDto> {
    const team = await getPrismaClient().team.findUnique({ where: { id }, include: { members: { include: MEMBER_WITH_USER_INCLUDE } } });
    if (!team) throw new NotFoundException('Team not found');
    return {
      id: team.id,
      name: team.name,
      description: team.description,
      createdAt: team.createdAt,
      memberCount: team.members.length,
      members: team.members.map(toMemberResponse),
    };
  }

  @Post()
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: TeamResponseDto })
  async create(@Body() dto: CreateTeamDto): Promise<TeamResponseDto> {
    const team = await getPrismaClient().team.create({ data: dto });
    return { id: team.id, name: team.name, description: team.description, createdAt: team.createdAt, memberCount: 0, members: [] };
  }

  @Patch(':id')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: TeamResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateTeamDto): Promise<TeamResponseDto> {
    try {
      const team = await getPrismaClient().team.update({
        where: { id },
        data: dto,
        include: { _count: { select: { members: true } } },
      });
      return { id: team.id, name: team.name, description: team.description, createdAt: team.createdAt, memberCount: team._count.members };
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Delete(':id')
  @RequirePermission('identity', 'write')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    try {
      await getPrismaClient().team.delete({ where: { id } });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Post(':id/members')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: TeamMemberResponseDto })
  async addMember(@Param('id') teamId: string, @Body() dto: AddTeamMemberDto): Promise<TeamMemberResponseDto> {
    const prisma = getPrismaClient();
    const [team, user] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamId } }),
      prisma.user.findUnique({ where: { id: dto.userId } }),
    ]);
    if (!team) throw new NotFoundException('Team not found');
    if (!user) throw new NotFoundException('User not found');

    try {
      const member = await prisma.teamMember.create({
        data: { teamId, userId: dto.userId, role: dto.role ?? 'MEMBER' },
        include: MEMBER_WITH_USER_INCLUDE,
      });
      return toMemberResponse(member);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('User is already a member of this team');
      }
      throw err;
    }
  }

  @Patch(':id/members/:userId')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: TeamMemberResponseDto })
  async updateMember(
    @Param('id') teamId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTeamMemberDto,
  ): Promise<TeamMemberResponseDto> {
    try {
      const member = await getPrismaClient().teamMember.update({
        where: { teamId_userId: { teamId, userId } },
        data: { role: dto.role },
        include: MEMBER_WITH_USER_INCLUDE,
      });
      return toMemberResponse(member);
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Delete(':id/members/:userId')
  @RequirePermission('identity', 'write')
  @HttpCode(204)
  async removeMember(@Param('id') teamId: string, @Param('userId') userId: string): Promise<void> {
    try {
      await getPrismaClient().teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }
}

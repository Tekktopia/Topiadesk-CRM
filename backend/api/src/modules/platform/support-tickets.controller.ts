import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import type { PlatformAdminContext } from './platform-context';
import { CreatePlatformTicketCommentDto, PlatformSupportTicketResponseDto, UpdateSupportTicketDto } from './dto/platform-support-ticket.dto';

function toResponse(ticket: {
  id: string;
  tenantId: string;
  tenant: { name: string };
  subject: string;
  description: string;
  status: string;
  priority: string;
  raisedByName: string;
  raisedByEmail: string;
  assignedToId: string | null;
  assignedTo: { fullName: string } | null;
  createdAt: Date;
  updatedAt: Date;
  comments?: { id: string; authorName: string; authorPlatformAdminId: string | null; body: string; createdAt: Date }[];
}): PlatformSupportTicketResponseDto {
  return {
    id: ticket.id,
    tenantId: ticket.tenantId,
    tenantName: ticket.tenant.name,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    raisedByName: ticket.raisedByName,
    raisedByEmail: ticket.raisedByEmail,
    assignedToId: ticket.assignedToId,
    assignedToName: ticket.assignedTo?.fullName ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    comments: ticket.comments,
  };
}

/** Platform-side view of every tenant's support tickets — list/filter,
 * reply, and change status/priority/assignee. Ordinary coarse platform
 * RLS (any active platform admin can see any tenant's tickets), same as
 * every other /platform surface. */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform/support-tickets')
export class PlatformSupportTicketsController {
  @Get()
  @ApiOkResponse({ type: [PlatformSupportTicketResponseDto] })
  async list(@Query('tenantId') tenantId?: string, @Query('status') status?: string): Promise<PlatformSupportTicketResponseDto[]> {
    const tickets = await getPlatformPrismaClient().supportTicket.findMany({
      where: {
        ...(tenantId && { tenantId }),
        ...(status && { status: status as never }),
      },
      include: { tenant: { select: { name: true } }, assignedTo: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return tickets.map(toResponse);
  }

  @Get(':id')
  @ApiOkResponse({ type: PlatformSupportTicketResponseDto })
  async get(@Param('id') id: string): Promise<PlatformSupportTicketResponseDto> {
    const ticket = await getPlatformPrismaClient().supportTicket.findUnique({
      where: { id },
      include: {
        tenant: { select: { name: true } },
        assignedTo: { select: { fullName: true } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException(`Support ticket ${id} not found`);
    return toResponse(ticket);
  }

  @Patch(':id')
  @ApiOkResponse({ type: PlatformSupportTicketResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateSupportTicketDto): Promise<PlatformSupportTicketResponseDto> {
    const prisma = getPlatformPrismaClient();
    const existing = await prisma.supportTicket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Support ticket ${id} not found`);

    const resolvedAt = dto.status === 'RESOLVED' && existing.status !== 'RESOLVED' ? new Date() : undefined;
    const closedAt = dto.status === 'CLOSED' && existing.status !== 'CLOSED' ? new Date() : undefined;

    const updated = await prisma.supportTicket.update({
      where: { id },
      data: {
        status: dto.status,
        priority: dto.priority,
        assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId,
        resolvedAt,
        closedAt,
      },
      include: { tenant: { select: { name: true } }, assignedTo: { select: { fullName: true } } },
    });
    return toResponse(updated);
  }

  @Post(':id/comments')
  @ApiOkResponse()
  async addComment(@Param('id') id: string, @Body() dto: CreatePlatformTicketCommentDto, @CurrentPlatformAdmin() admin: PlatformAdminContext) {
    const prisma = getPlatformPrismaClient();
    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException(`Support ticket ${id} not found`);
    return prisma.supportTicketComment.create({
      data: { ticketId: id, authorPlatformAdminId: admin.id, authorName: admin.fullName, authorEmail: admin.email, body: dto.body },
    });
  }
}

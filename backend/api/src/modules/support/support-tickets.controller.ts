import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getRlsContext, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CreateSupportTicketCommentDto, CreateSupportTicketDto, SupportTicketResponseDto } from './dto/support-ticket.dto';
import { enqueueCreateSupportTicket } from './create-support-ticket-queue';

/**
 * Tenant-side "contact support" surface — open to any authenticated tenant
 * user, no permission gate. Lives OUTSIDE `platform/*` so the normal
 * RlsContextMiddleware (tenant JWT) covers it via app.module.ts's
 * `forRoutes('*')` default, not PlatformContextMiddleware.
 *
 * Every handler here reaches into `packages/db-platform` (a schema this
 * request's own RlsContext was never meant to touch) — each does so via an
 * explicit `runWithRlsContext(SYSTEM_JOB_CONTEXT, ...)` wrapper, never the
 * ambient tenant RlsContext, so the platform-schema query runs under the
 * role platform RLS already trusts rather than under this tenant user's
 * own context. Creation still goes through a queued job regardless (see
 * this session's plan's Decision 5) — read/reply here are synchronous
 * because there's no request/response cycle for a job to serve.
 */
@ApiTags('support')
@ApiBearerAuth()
@Controller('support-tickets')
export class SupportTicketsController {
  private async currentTenantId(): Promise<string> {
    const tenantSchema = getRlsContext()?.tenantSchema;
    if (!tenantSchema) throw new ForbiddenException('No tenant context on this request');
    const tenant = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () => getPlatformPrismaClient().tenant.findFirst({ where: { schemaName: tenantSchema } }));
    if (!tenant) throw new ForbiddenException('Tenant not found');
    return tenant.id;
  }

  @Get()
  @ApiOkResponse({ type: [SupportTicketResponseDto] })
  async list(): Promise<SupportTicketResponseDto[]> {
    const tenantId = await this.currentTenantId();
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPlatformPrismaClient().supportTicket.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    );
  }

  @Get(':id')
  @ApiOkResponse({ type: SupportTicketResponseDto })
  async get(@Param('id') id: string): Promise<SupportTicketResponseDto> {
    const tenantId = await this.currentTenantId();
    const ticket = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPlatformPrismaClient().supportTicket.findUnique({ where: { id }, include: { comments: { orderBy: { createdAt: 'asc' } } } }),
    );
    if (!ticket || ticket.tenantId !== tenantId) throw new NotFoundException(`Support ticket ${id} not found`);
    return ticket;
  }

  @Post()
  @ApiOkResponse({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  async create(@Body() dto: CreateSupportTicketDto, @CurrentUser() user: AuthenticatedUser): Promise<{ status: 'queued' }> {
    const tenantSchema = getRlsContext()?.tenantSchema;
    if (!tenantSchema) throw new ForbiddenException('No tenant context on this request');
    await enqueueCreateSupportTicket({
      tenantSchema,
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority ?? 'MEDIUM',
      raisedByEmail: user.email,
      raisedByName: user.fullName,
    });
    return { status: 'queued' };
  }

  @Post(':id/comments')
  @ApiOkResponse()
  async addComment(@Param('id') id: string, @Body() dto: CreateSupportTicketCommentDto, @CurrentUser() user: AuthenticatedUser) {
    const tenantId = await this.currentTenantId();
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPlatformPrismaClient();
      const ticket = await prisma.supportTicket.findUnique({ where: { id } });
      if (!ticket || ticket.tenantId !== tenantId) throw new NotFoundException(`Support ticket ${id} not found`);
      return prisma.supportTicketComment.create({
        data: { ticketId: id, authorName: user.fullName, authorEmail: user.email, body: dto.body },
      });
    });
  }
}

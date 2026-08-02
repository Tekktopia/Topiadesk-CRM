import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, getRlsContext } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  ConvertLeadRequestDto,
  ConvertLeadResponseDto,
  CreateLeadDto,
  LeadQueryDto,
  LeadResponseDto,
  UpdateLeadDto,
  UpdateLeadScoreDto,
} from './dto/lead.dto';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/leads')
export class LeadsController {
  @Get()
  @RequirePermission('lead', 'read')
  @ApiOkResponse({ type: [LeadResponseDto] })
  async list(@Query() query: LeadQueryDto): Promise<LeadResponseDto[]> {
    return getPrismaClient().lead.findMany({
      where: {
        status: query.status,
        source: query.source,
        assignedToId: query.assignedToId,
        score: query.minScore !== undefined ? { gte: query.minScore } : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  @RequirePermission('lead', 'read')
  @ApiOkResponse({ type: LeadResponseDto })
  async getOne(@Param('id') id: string): Promise<LeadResponseDto> {
    const lead = await getPrismaClient().lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  @Post()
  @RequirePermission('lead', 'write')
  @ApiOkResponse({ type: LeadResponseDto })
  async create(@Body() dto: CreateLeadDto): Promise<LeadResponseDto> {
    return getPrismaClient().lead.create({ data: dto });
  }

  @Patch(':id')
  @RequirePermission('lead', 'write')
  @ApiOkResponse({ type: LeadResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto): Promise<LeadResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    return prisma.lead.update({ where: { id }, data: dto });
  }

  @Patch(':id/score')
  @RequirePermission('lead', 'write')
  @ApiOkResponse({ type: LeadResponseDto })
  async updateScore(@Param('id') id: string, @Body() dto: UpdateLeadScoreDto): Promise<LeadResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    return prisma.lead.update({ where: { id }, data: { score: dto.score } });
  }

  @Delete(':id')
  @RequirePermission('lead', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    await prisma.lead.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Lead -> Account (+ Opportunity) conversion.
   *
   * getPrismaClient() re-wraps every model call in its OWN interactive
   * $transaction (set_config, then the query — see packages/db/src/client.ts),
   * so account.create/opportunity.create/lead.update as top-level calls each
   * land in a *different* Postgres transaction — not atomic on their own.
   *
   * The natural fix — call $transaction directly on the wrapped client,
   * replicating its set_config step once at the top of the callback — was
   * tried and empirically DOES NOT WORK: `getPrismaClient().$transaction(cb)`
   * fails every time with a query-engine protocol error ("missing field
   * `max_wait`"), even though `$transaction` is listed as a PASSTHROUGH_KEY
   * in client.ts. Verified in isolation: a bare `new PrismaClient().$transaction(...)`
   * against the same pooled DATABASE_URL succeeds; the identical call through
   * getPrismaClient()'s Proxy fails; other passthrough methods on the same
   * Proxy (`$queryRaw`) succeed. So it's specifically `$transaction` that
   * breaks when invoked as `wrappedProxy.$transaction(...)` — `this` inside
   * Prisma's own $transaction implementation ends up bound to the Proxy
   * object instead of the real client, and something it reads off `this`
   * (transaction default options, by the look of the error) silently comes
   * back empty instead of throwing. Fixing that would mean changing
   * client.ts's forwarding strategy, which is out of this module's scope
   * (shared file, other agents depend on it) — flagged in the module report
   * instead. Do not reintroduce `getPrismaClient().$transaction(...)`
   * anywhere in this module without re-verifying against a live instance
   * first, per the same discipline client.ts's own header comment asks for.
   *
   * So: three sequential top-level calls, each individually RLS-wrapped and
   * confirmed working, with manual compensation (best-effort delete of
   * whatever was already created) if a later step fails. Not Postgres-level
   * atomicity — a crash between steps can leave a created Account or
   * Opportunity behind — but every failure path is handled explicitly
   * rather than risking silent partial writes, and this is the documented
   * fallback the build brief authorized when $transaction is in doubt.
   */
  @Post(':id/convert')
  @RequirePermission('lead', 'write')
  @ApiOkResponse({ type: ConvertLeadResponseDto })
  async convert(@Param('id') id: string, @Body() dto: ConvertLeadRequestDto): Promise<ConvertLeadResponseDto> {
    if (!dto.existingAccountId && !dto.accountName) {
      throw new BadRequestException('Provide either existingAccountId or accountName');
    }

    const prisma = getPrismaClient();
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status === 'CONVERTED') throw new ConflictException('Lead is already converted');

    const stage = await prisma.pipelineStage.findUnique({ where: { id: dto.pipelineStageId } });
    if (!stage) throw new NotFoundException('pipelineStageId not found');

    const ctx = getRlsContext();
    if (!ctx) throw new Error('convert() called outside an RLS context — RlsContextMiddleware should have bound one');

    const accountOwnerId = dto.accountOwnerId ?? lead.assignedToId ?? ctx.userId;
    const opportunityOwnerId = dto.opportunityOwnerId ?? lead.assignedToId ?? ctx.userId;

    let accountId: string;
    let createdNewAccount = false;
    if (dto.existingAccountId) {
      const existingAccount = await prisma.account.findUnique({ where: { id: dto.existingAccountId } });
      if (!existingAccount) throw new NotFoundException('existingAccountId not found or not visible');
      accountId = existingAccount.id;
    } else {
      const createdAccount = await prisma.account.create({
        data: {
          name: dto.accountName!,
          accountType: dto.accountType ?? (lead.companyName ? 'CORPORATE' : 'INDIVIDUAL'),
          status: 'CLIENT',
          industryId: dto.industryId,
          ownerId: accountOwnerId,
          source: lead.source,
        },
      });
      accountId = createdAccount.id;
      createdNewAccount = true;
    }

    let opportunityId: string;
    try {
      const opportunity = await prisma.opportunity.create({
        data: {
          accountId,
          name: dto.opportunityName,
          pipelineStageId: dto.pipelineStageId,
          amount: dto.amount,
          probability: dto.probability ?? stage.defaultProbability,
          expectedCloseDate: new Date(dto.expectedCloseDate),
          ownerId: opportunityOwnerId,
          lineOfBusiness: dto.lineOfBusiness,
        },
      });
      opportunityId = opportunity.id;
    } catch (err) {
      if (createdNewAccount) await prisma.account.delete({ where: { id: accountId } }).catch(() => undefined);
      throw err;
    }

    try {
      const updatedLead = await prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'CONVERTED', convertedAccountId: accountId, convertedOpportunityId: opportunityId },
      });
      return { accountId, opportunityId, lead: updatedLead };
    } catch (err) {
      await prisma.opportunity.delete({ where: { id: opportunityId } }).catch(() => undefined);
      if (createdNewAccount) await prisma.account.delete({ where: { id: accountId } }).catch(() => undefined);
      throw err;
    }
  }
}

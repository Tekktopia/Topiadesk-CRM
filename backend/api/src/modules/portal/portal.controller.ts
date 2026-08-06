import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, Prisma } from '@topiadesk/db';
import { ensureCaseSlaClocks } from '../case-management/sla-clock.util';
import { decimalToString } from '../policy/decimal.util';
// NOT type-only: DocumentsService is constructor-injected below — Nest's DI
// needs the real class reference at runtime (same footgun documented on
// Reflector in permission.guard.ts and DocumentsController's own import of
// this exact service).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DocumentsService } from '../documents/documents.service';
import { CurrentPortalContext } from './portal-context.decorator';
import type { PortalContext } from './portal-context';
import {
  CreatePortalCaseCommentDto,
  CreatePortalCaseDto,
  PortalCaseCommentDto,
  PortalCaseDto,
  PortalDocumentDto,
  PortalMeDto,
  PortalPolicyDto,
} from './dto/portal-response.dto';

function generateCaseNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `CASE-${datePart}-${suffix}`;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Case has far more internal fields (assignedToId, createdById,
 * slaPolicyId, resolutionNotes, ...) than a customer should ever see — this
 * is the only place a portal Case response is built, so every handler below
 * routes through it rather than returning a Prisma row directly (caught via
 * live testing: an earlier version returned `kase` as-is, which
 * type-checked fine against PortalCaseDto's Promise type — TS doesn't
 * excess-property-check a variable of a wider type — but leaked every
 * internal field over the wire). */
function toPortalCaseDto(kase: {
  id: string;
  caseNumber: string;
  caseType: string;
  subject: string;
  description: string | null;
  status: string;
  createdAt: Date;
}): PortalCaseDto {
  return {
    id: kase.id,
    caseNumber: kase.caseNumber,
    caseType: kase.caseType,
    subject: kase.subject,
    description: kase.description,
    status: kase.status,
    createdAt: kase.createdAt,
  };
}

/**
 * Customer-facing self-service portal — read-only Policies + Documents,
 * list/detail/reply on Cases, raise a new Case. Runs entirely under
 * SYSTEM_JOB_CONTEXT (RLS bypassed, same as public-knowledge.controller.ts)
 * via PortalContextMiddleware — every query below is EXPLICITLY filtered
 * by `ctx.accountId`, which is the real (and only) security boundary here.
 * Never remove one of those filters "because RLS already covers it" — it
 * doesn't, under this context.
 */
@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('me')
  @ApiOkResponse({ type: PortalMeDto })
  async getMe(@CurrentPortalContext() ctx: PortalContext): Promise<PortalMeDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const contact = await getPrismaClient().contact.findUnique({
        where: { id: ctx.contactId },
        include: { account: { select: { name: true } } },
      });
      return {
        contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : '',
        accountName: contact?.account?.name ?? '',
      };
    });
  }

  @Get('policies')
  @ApiOkResponse({ type: [PortalPolicyDto] })
  async listPolicies(@CurrentPortalContext() ctx: PortalContext): Promise<PortalPolicyDto[]> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const policies = await getPrismaClient().policy.findMany({
        where: { accountId: ctx.accountId },
        orderBy: { expiryDate: 'desc' },
      });
      return policies.map((p) => ({
        id: p.id,
        policyNumber: p.policyNumber,
        lineOfBusiness: p.lineOfBusiness,
        status: p.status,
        sumInsured: decimalToString(p.sumInsured),
        currency: p.currency,
        inceptionDate: p.inceptionDate,
        expiryDate: p.expiryDate,
      }));
    });
  }

  @Get('policies/:id')
  @ApiOkResponse({ type: PortalPolicyDto })
  async getPolicy(@Param('id') id: string, @CurrentPortalContext() ctx: PortalContext): Promise<PortalPolicyDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const policy = await getPrismaClient().policy.findFirst({ where: { id, accountId: ctx.accountId } });
      if (!policy) throw new NotFoundException('Policy not found');
      return {
        id: policy.id,
        policyNumber: policy.policyNumber,
        lineOfBusiness: policy.lineOfBusiness,
        status: policy.status,
        sumInsured: decimalToString(policy.sumInsured),
        currency: policy.currency,
        inceptionDate: policy.inceptionDate,
        expiryDate: policy.expiryDate,
      };
    });
  }

  @Get('cases')
  @ApiOkResponse({ type: [PortalCaseDto] })
  async listCases(@CurrentPortalContext() ctx: PortalContext): Promise<PortalCaseDto[]> {
    const cases = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().case.findMany({ where: { accountId: ctx.accountId }, orderBy: { createdAt: 'desc' } }),
    );
    return cases.map(toPortalCaseDto);
  }

  @Get('cases/:id')
  @ApiOkResponse({ type: PortalCaseDto })
  async getCase(@Param('id') id: string, @CurrentPortalContext() ctx: PortalContext): Promise<PortalCaseDto> {
    const kase = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().case.findFirst({ where: { id, accountId: ctx.accountId } }),
    );
    if (!kase) throw new NotFoundException('Ticket not found');
    return toPortalCaseDto(kase);
  }

  @Post('cases')
  @ApiOkResponse({ type: PortalCaseDto })
  async createCase(@Body() dto: CreatePortalCaseDto, @CurrentPortalContext() ctx: PortalContext): Promise<PortalCaseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      let created;
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        try {
          created = await prisma.case.create({
            data: {
              caseNumber: generateCaseNumber(),
              caseType: dto.caseType,
              subject: dto.subject,
              description: dto.description,
              accountId: ctx.accountId,
              contactId: ctx.contactId,
              sourceChannel: 'PORTAL_MESSAGE',
            },
          });
        } catch (err) {
          if (!isUniqueConstraintViolation(err) || attempt === 2) throw err;
        }
      }
      const kase = created!;
      await ensureCaseSlaClocks(kase.id, null, kase.caseType, kase.priority, kase.accountId).catch((err: unknown) => {
        console.error(`[portal] failed to start SLA clocks for case ${kase.id}`, err);
      });
      return toPortalCaseDto(kase);
    });
  }

  @Get('cases/:id/comments')
  @ApiOkResponse({ type: [PortalCaseCommentDto] })
  async listCaseComments(@Param('id') id: string, @CurrentPortalContext() ctx: PortalContext): Promise<PortalCaseCommentDto[]> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      const kase = await prisma.case.findFirst({ where: { id, accountId: ctx.accountId }, select: { id: true } });
      if (!kase) throw new NotFoundException('Ticket not found');

      const activities = await prisma.activity.findMany({
        where: { caseId: id, direction: { not: 'INTERNAL' } },
        include: { createdBy: { select: { fullName: true } }, createdByContact: { select: { firstName: true, lastName: true } } },
        orderBy: { occurredAt: 'asc' },
      });
      return activities.map((a) => ({
        id: a.id,
        subject: a.subject,
        body: a.body,
        direction: a.direction,
        authorLabel: a.createdByContact
          ? [a.createdByContact.firstName, a.createdByContact.lastName].filter(Boolean).join(' ')
          : (a.createdBy?.fullName ?? 'TopiaDesk team'),
        occurredAt: a.occurredAt,
      }));
    });
  }

  @Post('cases/:id/comments')
  @ApiOkResponse({ type: PortalCaseCommentDto })
  async addCaseComment(
    @Param('id') id: string,
    @Body() dto: CreatePortalCaseCommentDto,
    @CurrentPortalContext() ctx: PortalContext,
  ): Promise<PortalCaseCommentDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      const kase = await prisma.case.findFirst({ where: { id, accountId: ctx.accountId } });
      if (!kase) throw new NotFoundException('Ticket not found');

      const contact = await prisma.contact.findUnique({ where: { id: ctx.contactId }, select: { firstName: true, lastName: true } });
      const activity = await prisma.activity.create({
        data: {
          caseId: id,
          accountId: ctx.accountId,
          type: 'PORTAL_MESSAGE',
          direction: 'INBOUND',
          subject: 'Portal reply',
          body: dto.body,
          occurredAt: new Date(),
          createdByContactId: ctx.contactId,
        },
      });
      return {
        id: activity.id,
        subject: activity.subject,
        body: activity.body,
        direction: activity.direction,
        authorLabel: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : 'You',
        occurredAt: activity.occurredAt,
      };
    });
  }

  @Get('documents')
  @ApiOkResponse({ type: [PortalDocumentDto] })
  async listDocuments(@CurrentPortalContext() ctx: PortalContext): Promise<PortalDocumentDto[]> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const links = await getPrismaClient().documentLink.findMany({
        where: { entityType: 'ACCOUNT', entityId: ctx.accountId },
        include: { document: true },
        orderBy: { linkedAt: 'desc' },
      });
      return links
        .filter((l) => !l.document.isArchived)
        .map((l) => ({
          id: l.document.id,
          fileName: l.document.fileName,
          mimeType: l.document.mimeType,
          sizeBytes: Number(l.document.sizeBytes),
          createdAt: l.document.createdAt,
        }));
    });
  }

  @Get('documents/:id/download')
  async downloadDocument(
    @Param('id') id: string,
    @Query('versionId') versionId: string | undefined,
    @CurrentPortalContext() ctx: PortalContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Verified linked to this account before ever touching storage — a
    // Document with no matching DocumentLink for this accountId is treated
    // as not-found, not merely forbidden, same fail-closed shape as every
    // other portal lookup here. DocumentsService.getDownloadStream() itself
    // has no accountId concept at all (documents.controller.ts's internal
    // download is gated purely by staff auth) — this check is the entire
    // access boundary for this endpoint.
    const linked = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().documentLink.findFirst({ where: { documentId: id, entityType: 'ACCOUNT', entityId: ctx.accountId } }),
    );
    if (!linked) throw new NotFoundException('Document not found');

    const { stream, document, version } = await this.documents.getDownloadStream(id, versionId);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.fileName)}"`,
      'Content-Length': version.sizeBytes.toString(),
    });
    return new StreamableFile(stream);
  }
}

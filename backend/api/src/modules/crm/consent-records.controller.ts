import { Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ConsentRecordQueryDto, ConsentRecordResponseDto, CreateConsentRecordDto, CurrentConsentDto } from './dto/consent-record.dto';

/**
 * General-purpose consent log — see ConsentRecord's schema comment for the
 * append-only design. Gated on 'account' throughout, same as
 * ContactsController/DataSubjectRequestsController (no dedicated resource —
 * Contact has none of its own).
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/consent-records')
export class ConsentRecordsController {
  /** Full history for one contact, newest first. */
  @Get()
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [ConsentRecordResponseDto] })
  async list(@Query() query: ConsentRecordQueryDto): Promise<ConsentRecordResponseDto[]> {
    return getPrismaClient().consentRecord.findMany({
      where: { contactId: query.contactId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Current status per consentType — this contact's most recent record for each type they have any history on. */
  @Get('current')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [CurrentConsentDto] })
  async current(@Query() query: ConsentRecordQueryDto): Promise<CurrentConsentDto[]> {
    const records = await getPrismaClient().consentRecord.findMany({
      where: { contactId: query.contactId },
      orderBy: { createdAt: 'desc' },
    });
    const seen = new Set<string>();
    const current: CurrentConsentDto[] = [];
    for (const record of records) {
      if (seen.has(record.consentType)) continue;
      seen.add(record.consentType);
      current.push({ consentType: record.consentType, granted: record.granted, source: record.source, recordedAt: record.createdAt });
    }
    return current.sort((a, b) => a.consentType.localeCompare(b.consentType));
  }

  @Post()
  @RequirePermission('account', 'write')
  @ApiOkResponse({ type: ConsentRecordResponseDto })
  async create(@Body() dto: CreateConsentRecordDto, @CurrentUser() user: AuthenticatedUser): Promise<ConsentRecordResponseDto> {
    const prisma = getPrismaClient();
    const contact = await prisma.contact.findUnique({ where: { id: dto.contactId }, select: { id: true } });
    if (!contact) throw new NotFoundException('Contact not found');
    return prisma.consentRecord.create({
      data: {
        contactId: dto.contactId,
        consentType: dto.consentType,
        granted: dto.granted,
        source: dto.source,
        notes: dto.notes,
        recordedById: user.id,
      },
    });
  }
}

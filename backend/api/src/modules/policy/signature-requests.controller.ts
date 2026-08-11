import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT a type-only import — constructor-injected below, see the same
// footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ESignatureService } from '../integrations/esignature.service';
import { CreateSignatureRequestDto, SignatureRequestResponseDto } from './dto/signature-request.dto';

/** Nested under a policy, same shape as PolicyPremiumController — see premium.controller.ts's own header comment. */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies/:policyId/signature-requests')
export class SignatureRequestsController {
  constructor(private readonly esignature: ESignatureService) {}

  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [SignatureRequestResponseDto] })
  async list(@Param('policyId', ParseUUIDPipe) policyId: string): Promise<SignatureRequestResponseDto[]> {
    return getPrismaClient().signatureRequest.findMany({ where: { policyId }, orderBy: { sentAt: 'desc' } });
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: SignatureRequestResponseDto })
  async create(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CreateSignatureRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SignatureRequestResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');

    // The document must actually be linked to THIS policy — otherwise
    // policyId here would just be a routing convenience with no real
    // integrity check, letting a caller send an arbitrary/unrelated
    // document out for signature through a policy's own endpoint.
    const link = await prisma.documentLink.findFirst({ where: { documentId: dto.documentId, entityType: 'POLICY', entityId: policyId } });
    if (!link) throw new BadRequestException('Document is not linked to this policy');

    const document = await prisma.document.findUnique({ where: { id: dto.documentId }, select: { currentVersionId: true } });
    if (!document?.currentVersionId) throw new BadRequestException('Document has no current version to send');

    const { id } = await this.esignature.send({
      documentVersionId: document.currentVersionId,
      policyId,
      signerName: dto.signerName,
      signerEmail: dto.signerEmail,
      sentById: user.id,
    });
    return getPrismaClient().signatureRequest.findUniqueOrThrow({ where: { id } });
  }

  /** Staff-initiated cancellation — the SIGNED/DECLINED transitions come from the DocuSign webhook (see esignature.service.ts); this is the one transition a human triggers directly. */
  @Post(':id/void')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: SignatureRequestResponseDto })
  async voidRequest(@Param('policyId', ParseUUIDPipe) policyId: string, @Param('id', ParseUUIDPipe) id: string): Promise<SignatureRequestResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.signatureRequest.findUnique({ where: { id } });
    if (!existing || existing.policyId !== policyId) throw new NotFoundException('Signature request not found');
    if (existing.status === 'SIGNED' || existing.status === 'DECLINED') {
      throw new BadRequestException(`Cannot void a request that is already ${existing.status}`);
    }
    return prisma.signatureRequest.update({ where: { id }, data: { status: 'EXPIRED' } });
  }
}

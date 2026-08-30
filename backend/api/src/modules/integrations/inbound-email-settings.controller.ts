import { BadRequestException, Body, ConflictException, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { getRlsContext } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';

export class UpsertInboundEmailAddressDto {
  /** Empty string clears it (turns email-to-ticket off); omit to leave unchanged. */
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
}

export class InboundEmailAddressResponseDto {
  @ApiProperty({ nullable: true }) address!: string | null;
}

/**
 * Self-service: a tenant admin picks the address that turns an incoming
 * email into a Case (see omnichannel/inbound-email.controller.ts, which
 * looks this exact value up to resolve which tenant schema an arriving
 * message belongs to). Lives on platform.tenants, not the tenant-schema
 * MailSettings row — same "no tenant context exists yet" reasoning as
 * identity/tenant-branding.controller.ts's currentTenantId() helper,
 * copied here rather than shared since the two controllers otherwise have
 * nothing else in common.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('integrations/inbound-email')
export class InboundEmailSettingsController {
  private async currentTenantId(): Promise<string> {
    const tenantSchema = getRlsContext()?.tenantSchema ?? 'public';
    const tenant = await getPlatformPrismaClient().tenant.findFirst({ where: { schemaName: tenantSchema } });
    if (!tenant) throw new BadRequestException('Tenant not found for the current session');
    return tenant.id;
  }

  @Get()
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: InboundEmailAddressResponseDto })
  async get(): Promise<InboundEmailAddressResponseDto> {
    const tenantId = await this.currentTenantId();
    const tenant = await getPlatformPrismaClient().tenant.findUnique({
      where: { id: tenantId },
      select: { inboundEmailAddress: true },
    });
    return { address: tenant?.inboundEmailAddress ?? null };
  }

  @Put()
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: InboundEmailAddressResponseDto })
  async upsert(@Body() dto: UpsertInboundEmailAddressDto): Promise<InboundEmailAddressResponseDto> {
    const tenantId = await this.currentTenantId();
    const address = dto.address?.trim();
    if (address) {
      // class-validator's @IsEmail only runs against a defined, non-empty
      // string — an explicit check here covers the "cleared" (undefined)
      // and "typed garbage" cases the DTO's own @IsOptional lets through.
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
      if (!looksLikeEmail) throw new BadRequestException('That does not look like a real email address.');
    }
    try {
      const tenant = await getPlatformPrismaClient().tenant.update({
        where: { id: tenantId },
        data: { inboundEmailAddress: address ? address.toLowerCase() : null },
        select: { inboundEmailAddress: true },
      });
      return { address: tenant.inboundEmailAddress };
    } catch (err) {
      // Prisma P2002: the address is already claimed by another tenant.
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('That address is already in use by another organisation.');
      }
      throw err;
    }
  }
}

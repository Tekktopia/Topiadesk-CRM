import { BadRequestException, Body, ConflictException, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ImapFlow } from 'imapflow';
import { getPrismaClient, getRlsContext } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { decryptSecret, encryptSecret } from '@topiadesk/config';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';

export class UpsertInboundMailboxSettingsDto {
  @ApiProperty() @IsString() host!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(65535) port!: number;
  @ApiProperty({ description: 'true for implicit TLS (993, the IMAP norm).' }) @IsBoolean() secure!: boolean;
  @ApiProperty({ description: 'The mailbox to log into — also what customers should be told to email.' })
  @IsString()
  username!: string;
  /** Omit to KEEP the stored password; empty string clears it — same convention as outbound mail settings. */
  @ApiPropertyOptional({ description: 'Omit to keep the existing password unchanged.' })
  @IsOptional()
  @IsString()
  password?: string;
  @ApiPropertyOptional({ description: 'Defaults to INBOX.' }) @IsOptional() @IsString() folder?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class InboundMailboxSettingsResponseDto {
  @ApiProperty({ description: 'False when no settings row exists yet.' }) configured!: boolean;
  @ApiProperty({ nullable: true }) host!: string | null;
  @ApiProperty({ nullable: true }) port!: number | null;
  @ApiProperty() secure!: boolean;
  @ApiProperty({ nullable: true }) username!: string | null;
  /** Never the password itself — only whether one is stored. */
  @ApiProperty() hasPassword!: boolean;
  @ApiProperty() folder!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true }) lastPolledAt!: Date | null;
  @ApiProperty({ nullable: true }) lastPollError!: string | null;
  @ApiProperty({ nullable: true }) lastTestedAt!: Date | null;
  @ApiProperty({ nullable: true }) lastTestError!: string | null;
}

/**
 * Self-service "connect your mailbox, it just works" ticket-email setup —
 * IMAP polling (backend/worker/src/jobs/inbound-mail-poll/poll.job.ts logs
 * into `username`'s mailbox every few minutes and turns unseen mail into a
 * Case), not a DNS/MX-record or third-party-ESP-account flow. Deliberately
 * simpler than that alternative: a tenant admin has no reason to be able to
 * change their own domain's DNS or sign up with a mail provider just to get
 * ticket-by-email working.
 *
 * The actual polled mailbox settings live on the tenant-schema MailSettings
 * row (packages/db/prisma/schema.prisma) — but `username` is ALSO synced to
 * platform.tenants.inboundEmailAddress on every save. That sync is the one
 * piece of shared plumbing with omnichannel/inbound-email.controller.ts (the
 * public push-webhook path, kept available for a future real provider
 * integration): both this poller and that webhook ultimately need the same
 * "which tenant does this address belong to" answer, and platform.tenants is
 * the only place that answer can live (see that controller's own comment on
 * why — a public unauthenticated request has no tenant context yet).
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
  @ApiOkResponse({ type: InboundMailboxSettingsResponseDto })
  async get(): Promise<InboundMailboxSettingsResponseDto> {
    const settings = await getPrismaClient().mailSettings.findFirst();
    if (!settings) {
      return {
        configured: false,
        host: null,
        port: null,
        secure: true,
        username: null,
        hasPassword: false,
        folder: 'INBOX',
        isActive: false,
        lastPolledAt: null,
        lastPollError: null,
        lastTestedAt: null,
        lastTestError: null,
      };
    }
    return {
      configured: Boolean(settings.inboundHost),
      host: settings.inboundHost,
      port: settings.inboundPort,
      secure: settings.inboundSecure,
      username: settings.inboundUsername,
      hasPassword: Boolean(settings.inboundEncryptedPassword),
      folder: settings.inboundFolder,
      isActive: settings.inboundIsActive,
      lastPolledAt: settings.inboundLastPolledAt,
      lastPollError: settings.inboundLastPollError,
      lastTestedAt: settings.inboundLastTestedAt,
      lastTestError: settings.inboundLastTestError,
    };
  }

  @Put()
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: InboundMailboxSettingsResponseDto })
  async upsert(@Body() dto: UpsertInboundMailboxSettingsDto): Promise<InboundMailboxSettingsResponseDto> {
    const username = dto.username.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
      throw new BadRequestException('That does not look like a real email address.');
    }

    const prisma = getPrismaClient();
    const existing = await prisma.mailSettings.findFirst();
    const encryptedPassword =
      dto.password === undefined ? undefined : dto.password === '' ? null : encryptSecret(dto.password);

    const data = {
      inboundHost: dto.host,
      inboundPort: dto.port,
      inboundSecure: dto.secure,
      inboundUsername: username,
      inboundFolder: dto.folder?.trim() || 'INBOX',
      inboundIsActive: dto.isActive ?? false,
      ...(encryptedPassword === undefined ? {} : { inboundEncryptedPassword: encryptedPassword }),
    };

    // The public webhook's tenant lookup (platform.tenants.inboundEmailAddress)
    // must stay in lockstep with this row, or the two ingestion paths would
    // disagree about which tenant owns this address. Sync before the local
    // write so a conflict here (another tenant already claimed it) fails
    // BEFORE this tenant's own settings row changes at all.
    try {
      await getPlatformPrismaClient().tenant.update({
        where: { id: await this.currentTenantId() },
        data: { inboundEmailAddress: username },
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('That address is already in use by another organisation.');
      }
      throw err;
    }

    if (existing) await prisma.mailSettings.update({ where: { id: existing.id }, data });
    else {
      await prisma.mailSettings.create({
        data: {
          // MailSettings' outbound fields are NOT NULL — this row is being
          // created for the FIRST time via the inbound side, so the
          // outbound half needs a valid (if inert) placeholder rather than
          // a constraint violation. isActive stays false, so nothing
          // outbound-facing changes: mail-settings.controller.ts's own
          // upsert() still owns turning outbound on for real.
          provider: 'CUSTOM',
          host: '',
          port: 587,
          fromName: '',
          fromEmail: username,
          ...data,
          inboundEncryptedPassword: encryptedPassword ?? null,
        },
      });
    }

    return this.get();
  }

  @Post('test')
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ description: 'Result of the connection attempt.' })
  async test(): Promise<{ connected: boolean; error: string | null }> {
    const prisma = getPrismaClient();
    const settings = await prisma.mailSettings.findFirst();
    if (!settings?.inboundHost || !settings.inboundUsername || !settings.inboundEncryptedPassword) {
      throw new BadRequestException('Save inbound mailbox settings before testing the connection.');
    }

    const client = new ImapFlow({
      host: settings.inboundHost,
      port: settings.inboundPort ?? 993,
      secure: settings.inboundSecure,
      auth: { user: settings.inboundUsername, pass: decryptSecret(settings.inboundEncryptedPassword) },
      logger: false,
    });

    try {
      await client.connect();
      await client.mailboxOpen(settings.inboundFolder);
      await client.logout();
      await prisma.mailSettings.update({
        where: { id: settings.id },
        data: { inboundLastTestedAt: new Date(), inboundLastTestError: null },
      });
      return { connected: true, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.mailSettings.update({
        where: { id: settings.id },
        data: { inboundLastTestedAt: new Date(), inboundLastTestError: message.slice(0, 500) },
      });
      return { connected: false, error: message };
    }
  }
}

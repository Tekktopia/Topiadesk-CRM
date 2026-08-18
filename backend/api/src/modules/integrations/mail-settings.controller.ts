import { BadRequestException, Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import nodemailer from 'nodemailer';
import { getPrismaClient } from '@topiadesk/db';
import { decryptSecret, encryptSecret, loadEnv } from '@topiadesk/config';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
// NOT type-only: @Body() parameter types need a runtime value for
// ValidationPipe to resolve the metatype.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MailSettingsResponseDto, TestMailSettingsDto, UpsertMailSettingsDto } from './mail-settings.dto';

/**
 * Admin-managed outbound mail transport, per tenant.
 *
 * Replaces "edit SMTP_* in .env and redeploy". Those variables are
 * process-wide and identical for every tenant, so they cannot express one
 * firm on Microsoft 365 and another on Brevo — and changing them needs a
 * deployment, which puts a routine admin task in an engineer's hands.
 *
 * Gated on 'integration' at ALL scope for BOTH read and write: this row holds
 * an SMTP credential for the firm's own mail domain, and being able to read
 * it is most of the way to sending mail as the firm. RLS enforces the same
 * (mail_settings_rw).
 */
@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('integrations/mail-settings')
export class MailSettingsController {
  @Get()
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: MailSettingsResponseDto })
  async get(): Promise<MailSettingsResponseDto> {
    const settings = await getPrismaClient().mailSettings.findFirst();
    const env = loadEnv();
    if (!settings) {
      return {
        configured: false,
        provider: null,
        host: null,
        port: null,
        secure: false,
        username: null,
        hasPassword: false,
        fromName: null,
        fromEmail: null,
        replyToEmail: null,
        isActive: false,
        lastTestedAt: null,
        lastTestError: null,
        effectiveTransport: `${env.SMTP_HOST}:${env.SMTP_PORT} (from environment)`,
      };
    }
    return {
      configured: true,
      provider: settings.provider,
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      username: settings.username,
      // The password itself is never returned — only whether one exists.
      hasPassword: Boolean(settings.encryptedPassword),
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      replyToEmail: settings.replyToEmail,
      isActive: settings.isActive,
      lastTestedAt: settings.lastTestedAt,
      lastTestError: settings.lastTestError,
      effectiveTransport: settings.isActive
        ? `${settings.host}:${settings.port} (${settings.provider})`
        : `${env.SMTP_HOST}:${env.SMTP_PORT} (from environment — these settings are saved but not active)`,
    };
  }

  @Put()
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: MailSettingsResponseDto })
  async upsert(@Body() dto: UpsertMailSettingsDto): Promise<MailSettingsResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.mailSettings.findFirst();

    // Omitted password KEEPS the stored one; an empty string CLEARS it. That
    // distinction is what lets an admin flip isActive or fix a typo in the
    // host without re-entering the credential.
    const encryptedPassword =
      dto.password === undefined ? undefined : dto.password === '' ? null : encryptSecret(dto.password);

    const data = {
      provider: dto.provider,
      host: dto.host,
      port: dto.port,
      secure: dto.secure,
      username: dto.username ?? null,
      fromName: dto.fromName,
      fromEmail: dto.fromEmail,
      replyToEmail: dto.replyToEmail ?? null,
      isActive: dto.isActive ?? false,
      ...(encryptedPassword === undefined ? {} : { encryptedPassword }),
    };

    if (existing) await prisma.mailSettings.update({ where: { id: existing.id }, data });
    else await prisma.mailSettings.create({ data: { ...data, encryptedPassword: encryptedPassword ?? null } });

    return this.get();
  }

  /**
   * Sends a real message through the SAVED settings and records the outcome.
   *
   * Deliberately uses the stored configuration rather than one posted with
   * the request: the point is to prove that what the system will actually use
   * works — including that the password decrypts — not that some values typed
   * into a form would work.
   */
  @Post('test')
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ description: 'Result of the delivery attempt.' })
  async test(@Body() dto: TestMailSettingsDto): Promise<{ delivered: boolean; error: string | null }> {
    const prisma = getPrismaClient();
    const settings = await prisma.mailSettings.findFirst();
    if (!settings) throw new BadRequestException('Save mail settings before sending a test message.');

    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.username
        ? { user: settings.username, pass: settings.encryptedPassword ? decryptSecret(settings.encryptedPassword) : undefined }
        : undefined,
    } as nodemailer.TransportOptions);

    try {
      await transporter.sendMail({
        from: `${settings.fromName} <${settings.fromEmail}>`,
        to: dto.to,
        subject: 'TopiaDesk test message',
        text:
          'This is a test message from TopiaDesk.\n\n' +
          `Sent via ${settings.host}:${settings.port} as ${settings.fromEmail}.\n` +
          'If you received it, outbound mail is working.',
      });
      await prisma.mailSettings.update({
        where: { id: settings.id },
        data: { lastTestedAt: new Date(), lastTestError: null },
      });
      return { delivered: true, error: null };
    } catch (err) {
      // Recorded rather than only thrown, so the settings screen can show why
      // the last attempt failed without the admin re-running it.
      const message = err instanceof Error ? err.message : String(err);
      await prisma.mailSettings.update({
        where: { id: settings.id },
        data: { lastTestedAt: new Date(), lastTestError: message.slice(0, 500) },
      });
      return { delivered: false, error: message };
    }
  }
}

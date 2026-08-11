import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { loadEnv } from '@topiadesk/config';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { encryptToken, decryptToken } from '../integrations/oauth-token-crypto';
import { KeycloakAdminService } from './keycloak-admin.service';
import { MicrosoftSsoResponseDto, UpsertMicrosoftSsoDto } from './dto/microsoft-sso.dto';

/**
 * Per-tenant "Sign in with Microsoft 365" self-service config — each
 * tenant admin registers their own Azure App Registration here, pushed
 * live to their own Keycloak realm's "microsoft" identity provider via
 * KeycloakAdminService (which already auto-targets the current tenant's
 * realm from RlsContext — see that service's header comment). Gated on
 * the existing 'integration' permission resource (same ALL-scope,
 * admin-only tier as the Integrations connector list) rather than adding
 * a new resource to the seeded catalog.
 *
 * Single logical row — findFirst()/upsert-by-existing-id, not a DB
 * uniqueness constraint (schema-per-tenant already means there's only
 * ever one tenant's worth of rows here).
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/sso/microsoft')
export class MicrosoftSsoController {
  constructor(private readonly keycloakAdmin: KeycloakAdminService) {}

  @Get()
  @RequirePermission('integration', 'read')
  @ApiOkResponse({ type: MicrosoftSsoResponseDto })
  async get(): Promise<MicrosoftSsoResponseDto> {
    const config = await getPrismaClient().microsoftSsoConfig.findFirst();
    return {
      configured: Boolean(config),
      azureTenantId: config?.azureTenantId ?? null,
      azureClientId: config?.azureClientId ?? null,
      isEnabled: config?.isEnabled ?? false,
      redirectUri: this.redirectUri(),
    };
  }

  @Put()
  @RequirePermission('integration', 'write')
  @ApiOkResponse({ type: MicrosoftSsoResponseDto })
  async upsert(@Body() dto: UpsertMicrosoftSsoDto): Promise<MicrosoftSsoResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.microsoftSsoConfig.findFirst();
    const isEnabled = dto.isEnabled ?? existing?.isEnabled ?? true;

    // A caller that omits azureClientSecret (e.g. just toggling isEnabled)
    // keeps the existing encrypted value — decrypted here only to resend
    // to Keycloak, never returned to the client.
    const plaintextSecret = dto.azureClientSecret ?? (existing ? decryptToken(existing.encryptedClientSecret) : undefined);
    if (!plaintextSecret) {
      throw new BadRequestException('azureClientSecret is required when configuring Microsoft SSO for the first time');
    }

    await this.keycloakAdmin.upsertMicrosoftIdentityProvider({
      clientId: dto.azureClientId,
      clientSecret: plaintextSecret,
      tenantId: dto.azureTenantId,
      enabled: isEnabled,
    });

    const data = {
      azureTenantId: dto.azureTenantId,
      azureClientId: dto.azureClientId,
      encryptedClientSecret: encryptToken(plaintextSecret),
      isEnabled,
    };
    const saved = existing
      ? await prisma.microsoftSsoConfig.update({ where: { id: existing.id }, data })
      : await prisma.microsoftSsoConfig.create({ data });

    return {
      configured: true,
      azureTenantId: saved.azureTenantId,
      azureClientId: saved.azureClientId,
      isEnabled: saved.isEnabled,
      redirectUri: this.redirectUri(),
    };
  }

  @Delete()
  @RequirePermission('integration', 'write')
  @HttpCode(204)
  async remove(): Promise<void> {
    const prisma = getPrismaClient();
    const existing = await prisma.microsoftSsoConfig.findFirst();
    if (existing) await prisma.microsoftSsoConfig.delete({ where: { id: existing.id } });
    await this.keycloakAdmin.deleteMicrosoftIdentityProvider();
  }

  /** Derived purely from this tenant's own realm — valid to show before anything is saved, since it never depends on Azure-side values. */
  private redirectUri(): string {
    const env = loadEnv();
    const realm = this.keycloakAdmin.getCurrentRealmName();
    return `${env.KEYCLOAK_URL}/realms/${realm}/broker/microsoft/endpoint`;
  }
}

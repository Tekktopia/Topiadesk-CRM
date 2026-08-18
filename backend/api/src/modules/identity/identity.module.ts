import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { UsersController } from './users.controller';
import { RoleGrantsController } from './role-grants.controller';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';
import { FieldPermissionsController } from './field-permissions.controller';
import { ApiKeysController } from './api-keys.controller';
import { ExchangeRatesController } from './exchange-rates.controller';
import { DepartmentsController } from './departments.controller';
import { BranchesController } from './branches.controller';
import { TeamsController } from './teams.controller';
import { OrgSettingsController } from './org-settings.controller';
import { IpWhitelistController } from './ip-whitelist.controller';
import { KeycloakWebhookController } from './keycloak-webhook.controller';
import { ScimController } from './scim.controller';
import { ScimTokensController } from './scim-tokens.controller';
import { AuditExportController } from './audit-export.controller';
import { MicrosoftSsoController } from './microsoft-sso.controller';
import { TenantBrandingController } from './tenant-branding.controller';
import { PublicTenantBrandingController } from './public-tenant-branding.controller';
import { UserProvisioningService } from './user-provisioning.service';
import { KeycloakAdminService } from './keycloak-admin.service';

@Module({
  controllers: [
    IdentityController,
    UsersController,
    RoleGrantsController,
    RolesController,
    PermissionsController,
    FieldPermissionsController,
    ApiKeysController,
    ExchangeRatesController,
    DepartmentsController,
    BranchesController,
    TeamsController,
    OrgSettingsController,
    IpWhitelistController,
    KeycloakWebhookController,
    ScimController,
    ScimTokensController,
    AuditExportController,
    MicrosoftSsoController,
    TenantBrandingController,
    PublicTenantBrandingController,
  ],
  providers: [UserProvisioningService, KeycloakAdminService],
})
export class IdentityModule {}

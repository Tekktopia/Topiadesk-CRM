import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { IdentityController } from './identity.controller';
import { UsersController } from './users.controller';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';
import { DepartmentsController } from './departments.controller';
import { BranchesController } from './branches.controller';
import { TeamsController } from './teams.controller';
import { OrgSettingsController } from './org-settings.controller';
import { IpWhitelistController } from './ip-whitelist.controller';
import { KeycloakWebhookController } from './keycloak-webhook.controller';
import { ScimController } from './scim.controller';
import { ScimTokensController } from './scim-tokens.controller';
import { AuditExportController } from './audit-export.controller';
import { UserProvisioningService } from './user-provisioning.service';
import { KeycloakAdminService } from './keycloak-admin.service';

// AuditService is registered directly on AppModule's own providers (see
// app.module.ts) rather than via its own exported module — since AppModule
// is the root, that registration isn't visible to imported feature modules
// through Nest's DI scoping, so it's re-provided here too. It's stateless
// (reads getPrismaClient()/getRlsContext() singletons internally), so a
// second instance in this module's injector is harmless.
@Module({
  controllers: [
    IdentityController,
    UsersController,
    RolesController,
    PermissionsController,
    DepartmentsController,
    BranchesController,
    TeamsController,
    OrgSettingsController,
    IpWhitelistController,
    KeycloakWebhookController,
    ScimController,
    ScimTokensController,
    AuditExportController,
  ],
  providers: [AuditService, UserProvisioningService, KeycloakAdminService],
})
export class IdentityModule {}

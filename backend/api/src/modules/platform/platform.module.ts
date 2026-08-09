import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { TenantsController } from './tenants.controller';
import { PlansController } from './plans.controller';
import { PlatformAdminsController } from './platform-admins.controller';
import { TenantUsersController } from './tenant-users.controller';
import { PlatformSupportTicketsController } from './support-tickets.controller';
import { PlatformAuditLogController } from './platform-audit-log.controller';
import { PlatformAuditService } from './platform-audit.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { KeycloakAdminService } from '../identity/keycloak-admin.service';

// KeycloakAdminService is only provided by IdentityModule (not exported) —
// re-provided here, same convention IdentityModule's own header comment
// documents (stateless, a second DI-container instance is harmless).
@Module({
  controllers: [
    PlatformController,
    TenantsController,
    PlansController,
    PlatformAdminsController,
    TenantUsersController,
    PlatformSupportTicketsController,
    PlatformAuditLogController,
  ],
  providers: [KeycloakAdminService, PlatformAuditService],
})
export class PlatformModule {}

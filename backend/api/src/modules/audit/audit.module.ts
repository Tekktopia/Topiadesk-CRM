import { Global, Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuditLogController } from './audit-log.controller';

/**
 * @Global(): AuditService is stateless (reads getPrismaClient()/
 * getRlsContext() singletons internally) and used well beyond this
 * controller's own module — every feature module that logs a non-row-
 * mutation event (LOGIN/EXPORT/PERMISSION_CHANGE/...) needs it, and so
 * does PermissionGuard (common/auth/permission.guard.ts), which is
 * @UseGuards()'d directly on dozens of controllers across nearly every
 * module in the app. Before this, each of those feature modules
 * re-declared `AuditService` in its own `providers` array (harmless,
 * since it's stateless, but real duplication) since AppModule's own
 * providers aren't visible to imported modules through Nest's DI scoping.
 * @Global() on this module (imported once, in AppModule) fixes that at
 * the source — every module can now inject it with zero wiring of its
 * own, including ones (like PermissionGuard's) that can't reasonably
 * re-declare it in every controller-owning module without missing one.
 */
@Global()
@Module({
  controllers: [AuditLogController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

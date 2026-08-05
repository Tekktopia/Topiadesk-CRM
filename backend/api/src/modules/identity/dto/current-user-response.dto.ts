import { ApiProperty } from '@nestjs/swagger';
import type { PermissionScope } from '@topiadesk/db';

/**
 * One resolved (resource, action) -> highest granted scope, mirroring
 * app_max_scope() (packages/db/prisma/rls/002_policies.sql) — see
 * identity.controller.ts's resolveCaseConfigPermissions for how this is
 * computed. Consumed by frontend/web/app/(cases)/_lib/hooks.ts's useCan()
 * to button-gate New/Edit/Delete on the Case Config admin pages without
 * hardcoding role names.
 */
export class ResolvedPermissionDto {
  @ApiProperty() resource!: string;
  @ApiProperty({ enum: ['read', 'write'] }) action!: 'read' | 'write';
  @ApiProperty({ enum: ['OWN', 'DEPARTMENT', 'BRANCH', 'ALL'] }) scope!: PermissionScope;
}

export class CurrentUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ enum: ['ONLINE', 'AWAY', 'OFFLINE'] }) presenceStatus!: 'ONLINE' | 'AWAY' | 'OFFLINE';
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ nullable: true }) departmentId!: string | null;
  @ApiProperty({ nullable: true }) branchId!: string | null;
  @ApiProperty({ type: [ResolvedPermissionDto] }) permissions!: ResolvedPermissionDto[];
}

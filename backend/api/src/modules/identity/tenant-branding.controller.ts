import { Readable } from 'node:stream';
import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { getPrismaClient, getRlsContext, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { assertSafeImageMimeType } from '../../common/uploads/image-mimetype.util';
import { getMinioClient, documentsBucket } from '../documents/minio-client';
import { deleteTenantLogo, MAX_LOGO_BYTES, storeTenantLogoFromBuffer } from './tenant-branding-storage.util';

/**
 * Self-service: a tenant admin uploads/removes THEIR OWN tenant's
 * Keycloak login-page logo — resolved from the caller's own RlsContext
 * (never a path param, same "no cross-tenant reach" reasoning as every
 * other identity/* self-service route). `?? 'public'` mirrors
 * packages/db/src/rls-context.ts's own documented fallback (a null
 * tenantSchema means the original pre-multi-tenant deployment, whose
 * platform.tenants row really does have schema_name='public') — unlike
 * support-tickets.controller.ts's currentTenantId(), which throws instead
 * of falling back and so is unreachable for that one tenant today (a
 * separate, pre-existing gap, not fixed here).
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/branding/logo')
export class TenantBrandingController {
  private async currentTenantId(): Promise<string> {
    const tenantSchema = getRlsContext()?.tenantSchema ?? 'public';
    const tenant = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPlatformPrismaClient().tenant.findFirst({ where: { schemaName: tenantSchema } }),
    );
    if (!tenant) throw new NotFoundException('Tenant not found for the current session');
    return tenant.id;
  }

  /**
   * `@RequirePermission('identity', 'write')` alone is NOT enough here —
   * found live: COMPLIANCE_OFFICER's `identity:write` grant is deliberately
   * OWN-scoped (self-service profile fields only, see baseline.ts's seed
   * comment), yet successfully uploaded a tenant-wide logo through this
   * endpoint. For an ordinary tenant-schema write, RLS would independently
   * enforce that scope regardless of any app-layer guard bug (see
   * require-permission.decorator.ts's own "two independent layers" header
   * comment) — but this controller writes to the PLATFORM schema under
   * SYSTEM_JOB_CONTEXT, which has no scope concept at all, so RLS never
   * gets a chance to be the backstop. This checks ALL scope explicitly,
   * the one thing the guard alone can't tell apart from OWN/DEPARTMENT.
   */
  private async assertAllScopeIdentityWrite(user: AuthenticatedUser): Promise<void> {
    if (user.roles.includes('ADMIN')) return;
    const grantCount = await getPrismaClient().rolePermission.count({
      where: {
        roleId: { in: user.roleIds },
        permission: { resource: 'identity', action: 'write', scope: 'ALL' },
      },
    });
    if (grantCount === 0) throw new ForbiddenException('Missing permission: identity:write (ALL scope)');
  }

  @Post()
  @RequirePermission('identity', 'write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES } }))
  @ApiOkResponse({ schema: { type: 'object', properties: { uploaded: { type: 'boolean' } } } })
  async upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser): Promise<{ uploaded: boolean }> {
    await this.assertAllScopeIdentityWrite(user);
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded (expected multipart field "file")');
    assertSafeImageMimeType(file.mimetype, 'Logo');

    const tenantId = await this.currentTenantId();
    await storeTenantLogoFromBuffer(tenantId, file.buffer, file.mimetype, file.originalname);
    return { uploaded: true };
  }

  /**
   * Authenticated preview for the admin's own Org Settings page — the
   * PUBLIC, unauthenticated equivalent the Keycloak login page itself uses
   * is public-tenant-branding.controller.ts (keyed by realm name, not by a
   * bound session, since login happens before one exists).
   */
  @Get()
  @RequirePermission('identity', 'read')
  async get(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const tenantId = await this.currentTenantId();
    const tenant = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPlatformPrismaClient().tenant.findUnique({ where: { id: tenantId }, select: { logoStorageKey: true } }),
    );
    if (!tenant?.logoStorageKey) throw new NotFoundException('No logo set');

    const result = await getMinioClient().send(new GetObjectCommand({ Bucket: documentsBucket(), Key: tenant.logoStorageKey }));
    if (!result.Body) throw new NotFoundException('Logo missing from storage');

    res.set({
      'Content-Type': result.ContentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(result.Body as Readable);
  }

  @Delete()
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ schema: { type: 'object', properties: { deleted: { type: 'boolean' } } } })
  async remove(@CurrentUser() user: AuthenticatedUser): Promise<{ deleted: boolean }> {
    await this.assertAllScopeIdentityWrite(user);
    const tenantId = await this.currentTenantId();
    await deleteTenantLogo(tenantId);
    return { deleted: true };
  }
}

import type { Readable } from 'node:stream';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Response } from 'express';
import { getPrismaClient, type PermissionScope } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { getMinioClient, documentsBucket } from '../documents/minio-client';
import { storeAvatarFromBuffer } from './avatar-storage.util';
import { CurrentUserResponseDto, ResolvedPermissionDto } from './dto/current-user-response.dto';
import { UpdateMyPresenceDto } from './dto/update-my-presence.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';

/**
 * Resource/action pairs the app/(cases)/** Case Config admin pages
 * (sla-policies/macros/assignment-rules/business-hours/agent-skills/
 * case-categories/loss-cause-categories) need write-scope for, to
 * button-gate New/Edit/Delete client-side. NOT one resource per page —
 * see each case-management/*.controller.ts's @RequirePermission
 * decorators, the actual source of truth this list mirrors:
 *   - sla_config: sla-policies, assignment-rules, business-hours, agent-skills
 *   - macro: macros
 *   - case: case-categories (case-categories.controller.ts reuses 'case',
 *     no dedicated 'case_category' resource is seeded)
 *   - claim: loss-cause-categories (same story, reuses 'claim')
 * Kept as a small fixed list (not every Permission row) — this is purely a
 * UX-gating signal for one part of the frontend, not a general-purpose
 * permissions API. The backend's @RequirePermission guard on each endpoint
 * remains the real enforcement regardless of what this reports.
 */
const CASE_CONFIG_WRITE_RESOURCES = ['sla_config', 'macro', 'case', 'claim'] as const;

const SCOPE_RANK: Record<PermissionScope, number> = { OWN: 1, DEPARTMENT: 2, BRANCH: 3, ALL: 4 };

/**
 * Resolves the caller's highest granted scope per CASE_CONFIG_WRITE_RESOURCES
 * entry — same ADMIN-is-always-'ALL' short-circuit and the same
 * user_roles -> role_permissions -> permissions join PermissionGuard already
 * runs (common/auth/permission.guard.ts), and the same ranking
 * app_max_scope() uses (packages/db/prisma/rls/002_policies.sql) — done here
 * via Prisma rather than a raw SQL call into that Postgres function, since
 * this only needs a fixed, small resource list and Prisma is already the
 * established pattern for this exact join (see PermissionGuard).
 */
async function resolveCaseConfigPermissions(user: AuthenticatedUser): Promise<ResolvedPermissionDto[]> {
  if (user.roles.includes('ADMIN')) {
    return CASE_CONFIG_WRITE_RESOURCES.map((resource) => ({ resource, action: 'write', scope: 'ALL' as PermissionScope }));
  }

  const grants = await getPrismaClient().rolePermission.findMany({
    where: {
      role: { users: { some: { userId: user.id } } },
      permission: { resource: { in: [...CASE_CONFIG_WRITE_RESOURCES] }, action: 'write' },
    },
    select: { permission: { select: { resource: true, scope: true } } },
  });

  const maxScopeByResource = new Map<string, PermissionScope>();
  for (const grant of grants) {
    const { resource, scope } = grant.permission;
    const current = maxScopeByResource.get(resource);
    if (!current || SCOPE_RANK[scope] > SCOPE_RANK[current]) {
      maxScopeByResource.set(resource, scope);
    }
  }

  return Array.from(maxScopeByResource.entries()).map(([resource, scope]) => ({ resource, action: 'write' as const, scope }));
}

/**
 * Resolves the caller's own fullName/phone/presenceStatus + department/
 * branch NAME (not just id) in one query — `AuthenticatedUser` (from the
 * JWT/RLS context) only carries departmentId/branchId, and the profile
 * page needs a human-readable name without granting every user the
 * admin-only `identity:read` scope the full Department/Branch list
 * endpoints require just to see their own assignment.
 */
async function loadSelfWithNames(userId: string) {
  const row = await getPrismaClient().user.findUnique({
    where: { id: userId },
    select: {
      fullName: true,
      phone: true,
      presenceStatus: true,
      avatarStorageKey: true,
      department: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });
  return {
    fullName: row?.fullName ?? '',
    phone: row?.phone ?? null,
    presenceStatus: row?.presenceStatus ?? 'OFFLINE',
    hasAvatar: row?.avatarStorageKey != null,
    departmentName: row?.department?.name ?? null,
    branchName: row?.branch?.name ?? null,
  };
}

/**
 * Foundation stub — proves the auth/RLS pipeline end-to-end (JWT verify ->
 * local user resolution -> RLS context bind). Batch 1 Agent A owns
 * backend/api/src/modules/identity/: User/Role/Permission/Department/Branch/
 * TeamMember/OrgSetting/IpWhitelistEntry CRUD, Keycloak sync webhook.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity')
export class IdentityController {
  @Get('me')
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserResponseDto> {
    const self = await loadSelfWithNames(user.id);
    return { ...user, ...self, permissions: await resolveCaseConfigPermissions(user) };
  }

  /**
   * Self-service only — no @RequirePermission, deliberately: any
   * authenticated user may edit their own name/phone, the same way any
   * Zendesk/Freshdesk agent edits their own profile without needing a
   * broader user-management grant. Scoped to `@CurrentUser()`'s own id,
   * never a body-supplied id, so this can never touch another user's row —
   * same shape as updateMyPresence below. Distinct from
   * UsersController.update (PATCH /identity/users/:id), which is the
   * `identity:write`-gated admin path and also allows department/branch
   * reassignment.
   */
  @Patch('me')
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async updateMyProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMyProfileDto): Promise<CurrentUserResponseDto> {
    const data: { fullName?: string; phone?: string | null } = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (Object.keys(data).length > 0) {
      await getPrismaClient().user.update({ where: { id: user.id }, data });
    }
    const self = await loadSelfWithNames(user.id);
    return { ...user, ...self, permissions: await resolveCaseConfigPermissions(user) };
  }

  /**
   * Self-service only — no @RequirePermission, deliberately: any
   * authenticated user may set their own presence (Online/Away/Offline),
   * the same way any Zendesk/Freshdesk agent can toggle their own status
   * without needing a broader user-management grant. Scoped to `@CurrentUser()`'s
   * own id, never a body-supplied id, so this can never touch another
   * user's row.
   */
  @Patch('me/presence')
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async updateMyPresence(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMyPresenceDto): Promise<CurrentUserResponseDto> {
    await getPrismaClient().user.update({
      where: { id: user.id },
      data: { presenceStatus: dto.presenceStatus, presenceUpdatedAt: new Date() },
    });
    const self = await loadSelfWithNames(user.id);
    return { ...user, ...self, permissions: await resolveCaseConfigPermissions(user) };
  }

  /**
   * Self-service only, same own-id-scoped shape as updateMyProfile/
   * updateMyPresence above — self-only in this pass (no "view another
   * user's avatar" endpoint yet, see this batch's own brief). Storage
   * logic (MinIO write, old-object cleanup) lives in avatar-storage.util.ts,
   * shared with ScimController's photos-URL provisioning path.
   */
  @Post('me/avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async uploadMyAvatar(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser): Promise<CurrentUserResponseDto> {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded (expected multipart field "file")');
    if (!file.mimetype.startsWith('image/')) throw new BadRequestException('Avatar must be an image file');

    await storeAvatarFromBuffer(user.id, file.buffer, file.mimetype, file.originalname);

    const self = await loadSelfWithNames(user.id);
    return { ...user, ...self, permissions: await resolveCaseConfigPermissions(user) };
  }

  /**
   * No @RequirePermission (self-only via @CurrentUser(), same as the rest
   * of this controller's me/* routes) — streamed through the API rather
   * than a presigned URL for the same reason DocumentsController.download
   * is (MinIO isn't reachable outside the Docker network — see that
   * controller's doc comment). A short private cache lets the browser
   * avoid re-fetching the same bytes on every render of the header/sidebar
   * avatar within the hour without needing a cache-busting query param.
   */
  @Get('me/avatar')
  async getMyAvatar(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const row = await getPrismaClient().user.findUnique({ where: { id: user.id }, select: { avatarStorageKey: true } });
    if (!row?.avatarStorageKey) throw new NotFoundException('No avatar set');

    const result = await getMinioClient().send(new GetObjectCommand({ Bucket: documentsBucket(), Key: row.avatarStorageKey }));
    if (!result.Body) throw new NotFoundException('Avatar missing from storage');

    res.set({ 'Content-Type': result.ContentType ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' });
    return new StreamableFile(result.Body as Readable);
  }

  @Delete('me/avatar')
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async deleteMyAvatar(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { avatarStorageKey: true } });
    if (existing?.avatarStorageKey) {
      await prisma.user.update({ where: { id: user.id }, data: { avatarStorageKey: null } });
      await getMinioClient()
        .send(new DeleteObjectCommand({ Bucket: documentsBucket(), Key: existing.avatarStorageKey }))
        .catch(() => undefined);
    }
    const self = await loadSelfWithNames(user.id);
    return { ...user, ...self, permissions: await resolveCaseConfigPermissions(user) };
  }
}

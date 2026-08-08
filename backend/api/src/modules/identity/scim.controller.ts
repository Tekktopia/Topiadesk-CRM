import { randomUUID } from 'node:crypto';
import { BadGatewayException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Department, type User } from '@topiadesk/db';
import { ScimAuthGuard } from './scim-auth.guard';
// Neither of these two is a type-only import: both are constructor-injected
// below — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UserProvisioningService } from './user-provisioning.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { KeycloakAdminService } from './keycloak-admin.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment on SummarizeRequestDto in ai-gateway.controller.ts
import { ScimUserRequestDto, ScimPatchRequestDto, ScimGroupRequestDto } from './dto/scim.dto';
import { rethrowAsHttpException } from './prisma-error.util';
import { storeAvatarFromUrl } from './avatar-storage.util';

const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const SCIM_LIST_RESPONSE_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';

const GROUP_MAPPING_SETTING_KEY = 'scim.group_mapping_strategy';
type GroupMappingStrategy = 'department_code' | 'department_id';
const DEFAULT_GROUP_MAPPING_STRATEGY: GroupMappingStrategy = 'department_code';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 100;

/**
 * SCIM 2.0 (RFC 7643/7644) provisioning surface — TopiaDesk's sharpest admin
 * differentiator (see schema.prisma's Phase 2 header comment: Zendesk has no
 * SCIM on any plan, Freshdesk gates it behind a much pricier tier). Keycloak
 * is the real IdP and has no native SCIM support, so every write here does
 * TWO things in sequence: call KeycloakAdminService to create/update/disable
 * the actual Keycloak-side user (the account that can log in), then call
 * UserProvisioningService to reflect the same change into the local `users`
 * table Prisma/RLS actually reasons about — see user-provisioning.service.ts
 * for why that split exists and is shared with the Keycloak sync webhook.
 *
 * Excluded from RlsContextMiddleware in app.module.ts (integration-pass
 * follow-up — exact path list is in this module's final report): the caller
 * is an external IdP/provisioning tool presenting a ScimApiToken via
 * ScimAuthGuard, not a TopiaDesk user with a Keycloak JWT. That means no
 * ambient RLS context is bound the normal way, so every DB-touching handler
 * below wraps its body in `runWithRlsContext(SYSTEM_JOB_CONTEXT, ...)` —
 * same pattern, same reason, as keycloak-webhook.controller.ts.
 *
 * SCIM protocol coverage is deliberately a practical subset, not the full
 * RFC: filter supports only a single `attr eq "value"` clause (the
 * overwhelming majority of real IdP "does this user already exist" queries
 * — Okta/Azure AD/OneLogin all lead with this), and PATCH supports the
 * `active` (deprovisioning — the single most important PATCH operation in
 * practice), name, and members operations, not the full SCIM PATCH
 * path-filter grammar (e.g. `emails[type eq "work"].value`). Error response
 * bodies are NestJS's standard exception JSON, not the SCIM Error schema —
 * real clients key off the HTTP status code for control flow, not the body
 * shape, so this doesn't block interoperability for the cases that matter.
 */
@ApiTags('scim')
@UseGuards(ScimAuthGuard)
@Controller('scim/v2')
export class ScimController {
  constructor(
    private readonly provisioning: UserProvisioningService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  // ============================================================
  // Discovery — no DB access, no RLS context needed.
  // ============================================================

  @Get('ServiceProviderConfig')
  serviceProviderConfig(): Record<string, unknown> {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: MAX_PAGE_SIZE },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth Bearer Token',
          description: 'Authenticate with a ScimApiToken bearer token (see POST /identity/scim-tokens)',
          primary: true,
        },
      ],
    };
  }

  @Get('ResourceTypes')
  resourceTypes(): Record<string, unknown> {
    return {
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      totalResults: 2,
      Resources: [
        { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'User', name: 'User', endpoint: '/Users', schema: SCIM_USER_SCHEMA },
        { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'Group', name: 'Group', endpoint: '/Groups', schema: SCIM_GROUP_SCHEMA },
      ],
    };
  }

  @Get('Schemas')
  schemas(): Record<string, unknown> {
    return {
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      totalResults: 2,
      Resources: [
        { id: SCIM_USER_SCHEMA, name: 'User', description: 'TopiaDesk User (subset of the core SCIM User schema)' },
        { id: SCIM_GROUP_SCHEMA, name: 'Group', description: 'TopiaDesk Department, exposed as a SCIM Group' },
      ],
    };
  }

  // ============================================================
  // Users
  // ============================================================

  @Get('Users')
  listUsers(@Query('filter') filter?: string, @Query('startIndex') startIndex?: string, @Query('count') count?: string): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doListUsers(filter, startIndex, count));
  }

  @Get('Users/:id')
  getUser(@Param('id') id: string): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doGetUser(id));
  }

  @Post('Users')
  createUser(@Body() dto: ScimUserRequestDto): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doCreateUser(dto));
  }

  @Put('Users/:id')
  replaceUser(@Param('id') id: string, @Body() dto: ScimUserRequestDto): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doReplaceUser(id, dto));
  }

  @Patch('Users/:id')
  patchUser(@Param('id') id: string, @Body() dto: ScimPatchRequestDto): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doPatchUser(id, dto));
  }

  @Delete('Users/:id')
  @HttpCode(204)
  deleteUser(@Param('id') id: string): Promise<void> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doDeleteUser(id));
  }

  private async doListUsers(filter?: string, startIndexRaw?: string, countRaw?: string): Promise<Record<string, unknown>> {
    const prisma = getPrismaClient();
    const startIndex = clampPositiveInt(startIndexRaw, 1);
    const count = Math.min(clampPositiveInt(countRaw, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const parsed = parseSimpleEqFilter(filter);
    const where = parsed && (parsed.attr === 'username' || parsed.attr === 'email') ? { email: parsed.value } : {};

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy: { createdAt: 'asc' }, skip: startIndex - 1, take: count }),
    ]);

    return buildListResponse(users.map(buildScimUser), startIndex, total);
  }

  private async doGetUser(id: string): Promise<Record<string, unknown>> {
    const user = await getPrismaClient().user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return buildScimUser(user);
  }

  private async doCreateUser(dto: ScimUserRequestDto): Promise<Record<string, unknown>> {
    const email = primaryEmail(dto);
    const existingLocal = await getPrismaClient().user.findFirst({ where: { email } });
    if (existingLocal) throw new BadGatewayException(`A user with email ${email} already exists (id ${existingLocal.id})`);

    if (!this.keycloakAdmin.isConfigured()) {
      throw new ServiceUnavailableException(
        'SCIM user provisioning requires Keycloak admin integration (KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD) to be configured.',
      );
    }

    let keycloakUserId: string;
    try {
      const existingKc = await this.keycloakAdmin.findUserByEmail(email);
      // Reuses an out-of-band-created Keycloak user rather than erroring —
      // e.g. one created directly in Keycloak before SCIM sync was wired up
      // for this org.
      keycloakUserId =
        existingKc?.id ??
        (await this.keycloakAdmin.createUser({
          username: email,
          email,
          firstName: dto.name?.givenName,
          lastName: dto.name?.familyName,
          enabled: dto.active ?? true,
          emailVerified: true,
        }));
    } catch (err) {
      throw new BadGatewayException(`Keycloak user provisioning failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const result = await this.provisioning.upsertLocalUser({
      keycloakSubjectId: keycloakUserId,
      email,
      firstName: dto.name?.givenName,
      lastName: dto.name?.familyName,
      enabled: dto.active ?? true,
      departmentCode: dto.departmentCode,
      branchCode: dto.branchCode,
    });

    const user = await getPrismaClient().user.findUniqueOrThrow({ where: { id: result.userId! } });
    await this.syncAvatarBestEffort(user.id, dto);
    return buildScimUser(user);
  }

  private async doReplaceUser(id: string, dto: ScimUserRequestDto): Promise<Record<string, unknown>> {
    const existing = await getPrismaClient().user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    const email = primaryEmail(dto);

    if (this.keycloakAdmin.isConfigured()) {
      try {
        await this.keycloakAdmin.updateUser(existing.keycloakSubjectId, {
          username: email,
          email,
          firstName: dto.name?.givenName,
          lastName: dto.name?.familyName,
          enabled: dto.active ?? true,
        });
      } catch (err) {
        throw new BadGatewayException(`Keycloak user update failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const result = await this.provisioning.upsertLocalUser({
      keycloakSubjectId: existing.keycloakSubjectId,
      email,
      firstName: dto.name?.givenName,
      lastName: dto.name?.familyName,
      enabled: dto.active ?? true,
      departmentCode: dto.departmentCode,
      branchCode: dto.branchCode,
    });

    const user = await getPrismaClient().user.findUniqueOrThrow({ where: { id: result.userId! } });
    await this.syncAvatarBestEffort(user.id, dto);
    return buildScimUser(user);
  }

  private async doPatchUser(id: string, dto: ScimPatchRequestDto): Promise<Record<string, unknown>> {
    const existing = await getPrismaClient().user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    let active = existing.status === 'ACTIVE';
    let email = existing.email;
    const [existingFirst, ...existingRest] = existing.fullName.split(' ');
    let firstName = existingFirst;
    let lastName = existingRest.join(' ');
    let photoUrl: string | undefined;

    for (const op of dto.Operations) {
      const action = op.op.toLowerCase();
      if (action !== 'replace' && action !== 'add') continue; // 'remove' isn't meaningful for scalar User attributes — nothing here is a removable multi-value.
      const path = op.path?.toLowerCase();
      const value = op.value;

      if (path === 'active' && typeof value === 'boolean') active = value;
      else if ((path === 'username' || path === 'emails') && typeof value === 'string') email = value;
      else if (path === 'name.givenname' && typeof value === 'string') firstName = value;
      else if (path === 'name.familyname' && typeof value === 'string') lastName = value;
      else if (path === 'photos') photoUrl = extractPrimaryPhotoUrl(value);
      else if (!path && value && typeof value === 'object') {
        // Path-less replace with a whole (partial) User object — some IdPs
        // (Azure AD included) send this shape rather than dotted paths.
        const obj = value as Record<string, unknown>;
        if (typeof obj.active === 'boolean') active = obj.active;
        if (typeof obj.userName === 'string') email = obj.userName;
        if (obj.photos) photoUrl = extractPrimaryPhotoUrl(obj.photos) ?? photoUrl;
      }
    }

    if (this.keycloakAdmin.isConfigured()) {
      try {
        await this.keycloakAdmin.updateUser(existing.keycloakSubjectId, { username: email, email, firstName, lastName, enabled: active });
      } catch (err) {
        throw new BadGatewayException(`Keycloak user update failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const result = await this.provisioning.upsertLocalUser({
      keycloakSubjectId: existing.keycloakSubjectId,
      email,
      firstName,
      lastName,
      enabled: active,
    });
    const user = await getPrismaClient().user.findUniqueOrThrow({ where: { id: result.userId! } });
    if (photoUrl) {
      await storeAvatarFromUrl(user.id, photoUrl).catch((err: unknown) => {
        console.error(`[scim] avatar sync failed for user ${user.id}`, err);
      });
    }
    return buildScimUser(user);
  }

  private async doDeleteUser(id: string): Promise<void> {
    const existing = await getPrismaClient().user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    if (this.keycloakAdmin.isConfigured()) {
      try {
        await this.keycloakAdmin.setEnabled(existing.keycloakSubjectId, false);
      } catch (err) {
        throw new BadGatewayException(`Keycloak user disable failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await this.provisioning.deactivateByKeycloakSubjectId(existing.keycloakSubjectId);
  }

  // ============================================================
  // Groups (mapped to Department — see the module comment above)
  // ============================================================

  @Get('Groups')
  listGroups(@Query('startIndex') startIndex?: string, @Query('count') count?: string): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doListGroups(startIndex, count));
  }

  @Get('Groups/:id')
  getGroup(@Param('id') id: string): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doGetGroup(id));
  }

  @Post('Groups')
  createGroup(@Body() dto: ScimGroupRequestDto): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doCreateGroup(dto));
  }

  @Put('Groups/:id')
  replaceGroup(@Param('id') id: string, @Body() dto: ScimGroupRequestDto): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doReplaceGroup(id, dto));
  }

  @Patch('Groups/:id')
  patchGroup(@Param('id') id: string, @Body() dto: ScimPatchRequestDto): Promise<Record<string, unknown>> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doPatchGroup(id, dto));
  }

  @Delete('Groups/:id')
  @HttpCode(204)
  deleteGroup(@Param('id') id: string): Promise<void> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.doDeleteGroup(id));
  }

  private async doListGroups(startIndexRaw?: string, countRaw?: string): Promise<Record<string, unknown>> {
    const prisma = getPrismaClient();
    const startIndex = clampPositiveInt(startIndexRaw, 1);
    const count = Math.min(clampPositiveInt(countRaw, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

    const [total, departments] = await Promise.all([
      prisma.department.count(),
      prisma.department.findMany({
        orderBy: { name: 'asc' },
        skip: startIndex - 1,
        take: count,
        include: { users: { select: { id: true, fullName: true } } },
      }),
    ]);

    return buildListResponse(departments.map((d) => buildScimGroup(d, d.users)), startIndex, total);
  }

  private async doGetGroup(id: string): Promise<Record<string, unknown>> {
    const department = await getPrismaClient().department.findUnique({ where: { id }, include: { users: { select: { id: true, fullName: true } } } });
    if (!department) throw new NotFoundException('Group not found');
    return buildScimGroup(department, department.users);
  }

  private async doCreateGroup(dto: ScimGroupRequestDto): Promise<Record<string, unknown>> {
    const strategy = await this.groupMappingStrategy();
    const prisma = getPrismaClient();

    const department =
      strategy === 'department_code'
        ? await prisma.department.upsert({
            where: { code: slugifyToCode(dto.displayName) },
            update: { name: dto.displayName },
            create: { code: slugifyToCode(dto.displayName), name: dto.displayName },
          })
        : // department_id strategy: SCIM `id` is service-provider-assigned, so
          // create always mints a fresh Department; the IdP is expected to
          // persist OUR returned id for subsequent PUT/PATCH/DELETE-by-id
          // calls rather than re-deriving it from displayName each time.
          await prisma.department.create({ data: { code: `SCIM-${randomUUID().slice(0, 8).toUpperCase()}`, name: dto.displayName } });

    if (dto.members && dto.members.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: dto.members.map((m) => m.value) } }, data: { departmentId: department.id } });
    }

    const withUsers = await prisma.department.findUniqueOrThrow({ where: { id: department.id }, include: { users: { select: { id: true, fullName: true } } } });
    return buildScimGroup(withUsers, withUsers.users);
  }

  private async doReplaceGroup(id: string, dto: ScimGroupRequestDto): Promise<Record<string, unknown>> {
    const prisma = getPrismaClient();
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Group not found');

    await prisma.department.update({ where: { id }, data: { name: dto.displayName } });

    // Full replace of membership. Two sequential top-level calls (not a
    // $transaction(async tx => ...) wrapping both) — see leads.controller.ts's
    // convert() for why: a nested `tx.user.updateMany(...)` bypasses
    // getPrismaClient()'s RLS-wrapping Proxy entirely (only top-level calls
    // through `prisma.<model>` go through it), which silently skips the
    // set_config step. Not fully atomic, same accepted tradeoff as convert().
    const memberIds = dto.members?.map((m) => m.value) ?? [];
    await prisma.user.updateMany({
      where: { departmentId: id, ...(memberIds.length > 0 ? { id: { notIn: memberIds } } : {}) },
      data: { departmentId: null },
    });
    if (memberIds.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: memberIds } }, data: { departmentId: id } });
    }

    const withUsers = await prisma.department.findUniqueOrThrow({ where: { id }, include: { users: { select: { id: true, fullName: true } } } });
    return buildScimGroup(withUsers, withUsers.users);
  }

  private async doPatchGroup(id: string, dto: ScimPatchRequestDto): Promise<Record<string, unknown>> {
    const prisma = getPrismaClient();
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Group not found');

    for (const op of dto.Operations) {
      const action = op.op.toLowerCase();
      const path = op.path?.toLowerCase();
      if (path !== undefined && path !== 'members') continue; // only membership patching is supported for Group

      const memberIds = extractMemberIds(op.value);
      if (action === 'add' && memberIds.length > 0) {
        await prisma.user.updateMany({ where: { id: { in: memberIds } }, data: { departmentId: id } });
      } else if (action === 'remove') {
        if (memberIds.length > 0) {
          await prisma.user.updateMany({ where: { id: { in: memberIds }, departmentId: id }, data: { departmentId: null } });
        } else {
          // Bare `{op:"remove", path:"members"}` with no member list — SCIM
          // semantics for this are "remove every current member".
          await prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } });
        }
      } else if (action === 'replace') {
        await prisma.user.updateMany({
          where: { departmentId: id, ...(memberIds.length > 0 ? { id: { notIn: memberIds } } : {}) },
          data: { departmentId: null },
        });
        if (memberIds.length > 0) await prisma.user.updateMany({ where: { id: { in: memberIds } }, data: { departmentId: id } });
      }
    }

    const withUsers = await prisma.department.findUniqueOrThrow({ where: { id }, include: { users: { select: { id: true, fullName: true } } } });
    return buildScimGroup(withUsers, withUsers.users);
  }

  private async doDeleteGroup(id: string): Promise<void> {
    const prisma = getPrismaClient();
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Group not found');
    // Evict members first — User.departmentId is a plain nullable FK with no
    // cascade, so the delete below would otherwise fail with a P2003.
    await prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } });
    try {
      await prisma.department.delete({ where: { id } });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  /** Best-effort — a broken/unreachable photo URL must never fail a
   * user-provisioning request (see avatar-storage.util.ts's doc comment on
   * storeAvatarFromUrl for why it throws rather than swallowing errors
   * itself: this call site is where the "don't fail the request" decision
   * actually belongs, not the shared util). */
  private async syncAvatarBestEffort(userId: string, dto: ScimUserRequestDto): Promise<void> {
    const photoUrl = extractPrimaryPhotoUrl(dto.photos);
    if (!photoUrl) return;
    await storeAvatarFromUrl(userId, photoUrl).catch((err: unknown) => {
      console.error(`[scim] avatar sync failed for user ${userId}`, err);
    });
  }

  private async groupMappingStrategy(): Promise<GroupMappingStrategy> {
    const setting = await getPrismaClient().orgSetting.findUnique({ where: { key: GROUP_MAPPING_SETTING_KEY } });
    const value = setting?.value as { strategy?: string } | null;
    return value?.strategy === 'department_id' ? 'department_id' : DEFAULT_GROUP_MAPPING_STRATEGY;
  }
}

function primaryEmail(dto: ScimUserRequestDto): string {
  return dto.emails?.find((e) => e.primary)?.value ?? dto.emails?.[0]?.value ?? dto.userName;
}

function buildScimUser(user: User): Record<string, unknown> {
  const [givenName, ...rest] = user.fullName.split(' ');
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    externalId: user.keycloakSubjectId,
    userName: user.email,
    name: { givenName: givenName || user.fullName, familyName: rest.join(' ') || undefined },
    emails: [{ value: user.email, primary: true }],
    active: user.status === 'ACTIVE',
    meta: {
      resourceType: 'User',
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `/scim/v2/Users/${user.id}`,
    },
  };
}

function buildScimGroup(department: Department, members: Array<{ id: string; fullName: string }>): Record<string, unknown> {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: department.id,
    displayName: department.name,
    members: members.map((m) => ({ value: m.id, display: m.fullName })),
    meta: { resourceType: 'Group', location: `/scim/v2/Groups/${department.id}` },
  };
}

function buildListResponse(resources: Array<Record<string, unknown>>, startIndex: number, totalResults: number): Record<string, unknown> {
  return { schemas: [SCIM_LIST_RESPONSE_SCHEMA], totalResults, startIndex, itemsPerPage: resources.length, Resources: resources };
}

/** Only `attr eq "value"` — see the class header comment for why the full SCIM filter grammar isn't implemented. */
function parseSimpleEqFilter(filter?: string): { attr: string; value: string } | null {
  if (!filter) return null;
  const match = /^(\w+)\s+eq\s+"([^"]*)"$/i.exec(filter.trim());
  if (!match) return null;
  return { attr: match[1]!.toLowerCase(), value: match[2]! };
}

function clampPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Picks the `primary: true` entry if one exists, else the first — same
 * "primary-or-first" convention primaryEmail() above uses for `emails`. */
function extractPrimaryPhotoUrl(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const photos = value as Array<{ value?: unknown; primary?: unknown }>;
  const primary = photos.find((p) => p.primary === true && typeof p.value === 'string');
  if (primary) return primary.value as string;
  const first = photos.find((p) => typeof p.value === 'string');
  return first?.value as string | undefined;
}

function extractMemberIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : (v as { value?: string })?.value)).filter((v): v is string => Boolean(v));
  }
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const v = (value as { value?: string }).value;
    return v ? [v] : [];
  }
  return [];
}

/** Uppercase, non-alphanumeric-to-hyphen — matches departments.code's existing style (e.g. 'CORP-BROK', 'CLAIMS-COMP'). */
function slugifyToCode(displayName: string): string {
  return displayName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

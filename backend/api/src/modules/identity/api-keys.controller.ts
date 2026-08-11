import { Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, getRlsContext, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { generateApiKey, hashApiKey, lastFourOf } from './api-key.util';
import { ApiKeyCreatedResponseDto, ApiKeyResponseDto, CreateApiKeyDto } from './dto/api-key.dto';

/**
 * Self-service API keys — "log in as me" bearer tokens for a script/
 * integration to call this same REST API under the caller's own live
 * permissions (see ApiKey's schema.prisma comment). No @RequirePermission
 * anywhere here — same own-id-scoped, no-special-grant-needed shape as
 * IdentityController's /identity/me endpoints, deliberately: this is
 * self-service specifically because it needs no admin involvement.
 *
 * Every query below runs under a forced public-schema context
 * (SYSTEM_JOB_CONTEXT) regardless of the caller's own tenant — api_keys
 * lives ONLY in `public` (see that model's comment for why), but the
 * caller's ambient RlsContext.tenantSchema is their OWN tenant, which
 * would otherwise point every query at the wrong schema entirely.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/me/api-keys')
export class ApiKeysController {
  @Get()
  @ApiOkResponse({ type: [ApiKeyResponseDto] })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ApiKeyResponseDto[]> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => getPrismaClient().apiKey.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }));
  }

  @Post()
  @ApiOkResponse({ type: ApiKeyCreatedResponseDto })
  async create(@Body() dto: CreateApiKeyDto, @CurrentUser() user: AuthenticatedUser): Promise<ApiKeyCreatedResponseDto> {
    const tenantSchema = getRlsContext()?.tenantSchema ?? null;
    if (!tenantSchema) {
      // The one pre-multi-tenant deployment (tenantSchema resolves to
      // 'public' via a null context — see RlsContext.tenantSchema's own
      // comment) has no meaningful "which tenant does this key belong to"
      // to record; rather than silently store a wrong/empty value, this
      // deliberately isn't supported for that single legacy case.
      throw new NotFoundException('API keys require a resolved tenant context');
    }
    const rawKey = generateApiKey();
    const created = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().apiKey.create({
        data: {
          name: dto.name,
          tokenHash: hashApiKey(rawKey),
          tokenLastFour: lastFourOf(rawKey),
          tenantSchema,
          userId: user.id,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
      }),
    );
    return { ...created, token: rawKey };
  }

  @Delete(':id')
  async revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ revoked: boolean }> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      const existing = await prisma.apiKey.findUnique({ where: { id } });
      // 404 (not 403) whether it's someone else's key or doesn't exist at
      // all — same "don't confirm existence of another user's row"
      // reasoning as every other self-scoped endpoint in this codebase.
      if (!existing || existing.userId !== user.id) throw new NotFoundException('API key not found');
      await prisma.apiKey.update({ where: { id }, data: { isActive: false } });
      return { revoked: true };
    });
  }
}

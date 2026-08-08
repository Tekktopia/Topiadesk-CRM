import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreateScimTokenDto, ScimTokenCreatedResponseDto, ScimTokenResponseDto, UpdateScimTokenDto } from './dto/scim-token.dto';
import { generateScimToken, hashScimToken } from './scim-token.util';
import { rethrowAsHttpException } from './prisma-error.util';

/**
 * Management surface for ScimApiToken — normal JWT-authenticated, gated by
 * the same 'identity' resource as roles/departments/etc (RLS's
 * scim_api_tokens_rw requires ALL-scope 'identity', matching this). The
 * actual SCIM protocol endpoints (scim.controller.ts, /scim/v2/*) are
 * authenticated differently — by the tokens minted here, via ScimAuthGuard
 * — not by this controller's own PermissionGuard.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/scim-tokens')
export class ScimTokensController {
  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [ScimTokenResponseDto] })
  async list(): Promise<ScimTokenResponseDto[]> {
    return getPrismaClient().scimApiToken.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post()
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: ScimTokenCreatedResponseDto })
  async create(@Body() dto: CreateScimTokenDto): Promise<ScimTokenCreatedResponseDto> {
    const rawToken = generateScimToken();
    const created = await getPrismaClient().scimApiToken.create({
      data: { description: dto.description, tokenHash: hashScimToken(rawToken) },
    });
    return { ...created, token: rawToken };
  }

  @Patch(':id')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: ScimTokenResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateScimTokenDto): Promise<ScimTokenResponseDto> {
    const existing = await getPrismaClient().scimApiToken.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('SCIM token not found');
    return getPrismaClient().scimApiToken.update({ where: { id }, data: { description: dto.description } });
  }

  @Delete(':id')
  @RequirePermission('identity', 'write')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    try {
      await getPrismaClient().scimApiToken.delete({ where: { id } });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Post(':id/deactivate')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: ScimTokenResponseDto })
  async deactivate(@Param('id') id: string): Promise<ScimTokenResponseDto> {
    const existing = await getPrismaClient().scimApiToken.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('SCIM token not found');
    return getPrismaClient().scimApiToken.update({ where: { id }, data: { isActive: false } });
  }
}

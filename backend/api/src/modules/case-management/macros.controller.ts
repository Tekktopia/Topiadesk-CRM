import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Macro, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
// NOT type-only — constructor-injected below, see claims.controller.ts's comment.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MacrosService } from './macros.service';
import { ActionSpecDto, CreateMacroDto, MacroPreviewRequestDto, MacroPreviewResponseDto, MacroResponseDto, UpdateMacroDto } from './dto/macro.dto';

function toMacroDto(macro: Macro): MacroResponseDto {
  return { ...macro, actions: (Array.isArray(macro.actions) ? macro.actions : []) as unknown as ActionSpecDto[] };
}

/**
 * Macro.actions/AutomationRule.actions share the same ActionSpec[] shape
 * and action-handler registry — see automation/action-handler.ts. This
 * controller owns CRUD + the dry-run preview; the actual "apply to a case"
 * endpoint lives on cases.controller.ts (POST :id/apply-macro/:macroId),
 * per the build brief's endpoint list (Claim has no equivalent apply
 * endpoint in that list, so none was added here — see module report).
 * macros_rw's RLS lets any authenticated user create/apply their OWN
 * macros (WITH CHECK: created_by_id = self) — 'macro' permission is
 * therefore granted at OWN scope to every operational role, not just ADMIN.
 */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('macros')
export class MacrosController {
  constructor(private readonly macros: MacrosService) {}

  @Get()
  @RequirePermission('macro', 'read')
  @ApiOkResponse({ type: [MacroResponseDto] })
  async list(): Promise<MacroResponseDto[]> {
    const macros = await getPrismaClient().macro.findMany({ orderBy: { name: 'asc' } });
    return macros.map(toMacroDto);
  }

  @Get(':id')
  @RequirePermission('macro', 'read')
  @ApiOkResponse({ type: MacroResponseDto })
  async getOne(@Param('id') id: string): Promise<MacroResponseDto> {
    const macro = await getPrismaClient().macro.findUnique({ where: { id } });
    if (!macro) throw new NotFoundException('Macro not found');
    return toMacroDto(macro);
  }

  @Post()
  @RequirePermission('macro', 'write')
  @ApiOkResponse({ type: MacroResponseDto })
  async create(@Body() dto: CreateMacroDto, @CurrentUser() user: AuthenticatedUser): Promise<MacroResponseDto> {
    const macro = await getPrismaClient().macro.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        entityType: dto.entityType,
        actions: dto.actions as unknown as Prisma.InputJsonValue,
        isActive: dto.isActive,
        createdById: user.id,
      },
    });
    return toMacroDto(macro);
  }

  @Patch(':id')
  @RequirePermission('macro', 'write')
  @ApiOkResponse({ type: MacroResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateMacroDto): Promise<MacroResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.macro.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Macro not found');
    const macro = await prisma.macro.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        entityType: dto.entityType,
        actions: dto.actions ? (dto.actions as unknown as Prisma.InputJsonValue) : undefined,
        isActive: dto.isActive,
      },
    });
    return toMacroDto(macro);
  }

  @Delete(':id')
  @RequirePermission('macro', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.macro.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Macro not found');
    await prisma.macro.delete({ where: { id } });
    return { deleted: true };
  }

  /** Dry-run: describes what each action would change against a real Claim/Case, without executing anything. */
  @Post(':id/preview')
  @RequirePermission('macro', 'read')
  @ApiOkResponse({ type: MacroPreviewResponseDto })
  async preview(@Param('id') id: string, @Body() dto: MacroPreviewRequestDto): Promise<MacroPreviewResponseDto> {
    const changes = await this.macros.preview(id, dto.entityType, dto.entityId);
    return { macroId: id, entityType: dto.entityType, entityId: dto.entityId, changes };
  }
}

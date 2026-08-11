import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { DashboardVisibility } from '@topiadesk/db';

/**
 * `widgets`/`layoutConfig` are plain JSON (see SavedDashboard's
 * schema.prisma doc comment: widgets reference fixed server-defined report
 * keys with typed filters, never a raw query string) — `@Type(() =>
 * Object)` on the array is load-bearing, not decorative, the same
 * class-transformer/whitelist gotcha documented on CreateAutomationRuleDto
 * (backend/api/src/modules/crm/dto/automation-rule.dto.ts): without it,
 * NestJS's global ValidationPipe silently strips every property off each
 * widget object before this DTO's `widgets` field is populated.
 */
export class CreateSavedDashboardDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: DashboardVisibility, default: 'PRIVATE' }) @IsEnum(DashboardVisibility) visibility!: keyof typeof DashboardVisibility;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsArray()
  @Type(() => Object)
  widgets!: unknown[];
  @ApiProperty({ type: 'object', additionalProperties: true }) @IsObject() layoutConfig!: Record<string, unknown>;
}

export class UpdateSavedDashboardDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional({ enum: DashboardVisibility }) @IsOptional() @IsEnum(DashboardVisibility) visibility?: keyof typeof DashboardVisibility;
  @ApiPropertyOptional({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsOptional()
  @IsArray()
  @Type(() => Object)
  widgets?: unknown[];
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @IsOptional() @IsObject() layoutConfig?: Record<string, unknown>;
}

/**
 * POST /saved-dashboards/render-preview — lets the Customize-mode editor
 * show real rendered tiles for a draft widget set that hasn't been saved
 * (and may never be, if the edit is cancelled) yet, instead of the blank/
 * title-only placeholder the editor showed before. Same permissive
 * `@Type(() => Object)` widgets shape as Create/UpdateSavedDashboardDto —
 * this never touches the database, it's a stateless pass-through into the
 * same `renderDashboardWidgets` the persisted `:id/render` route uses.
 */
export class RenderPreviewDto {
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsArray()
  @Type(() => Object)
  widgets!: unknown[];
}

export class SavedDashboardResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) ownerId!: string | null;
  @ApiProperty({ enum: DashboardVisibility }) visibility!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) layoutConfig!: unknown;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } }) widgets!: unknown;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

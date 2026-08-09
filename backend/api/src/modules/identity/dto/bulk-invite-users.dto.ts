import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class BulkInviteUserRowDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(1) fullName!: string;
  @ApiPropertyOptional({ description: 'Department code (e.g. CORP-BROK) — silently unset if the code is unknown, same lenient behavior as SCIM provisioning' })
  @IsOptional()
  @IsString()
  departmentCode?: string;
  @ApiPropertyOptional({ description: 'Branch code (e.g. ABV) — silently unset if the code is unknown' })
  @IsOptional()
  @IsString()
  branchCode?: string;
}

/** Max 200 rows per request — this is a synchronous, in-request loop (see
 * users.controller.ts's bulkInvite() header comment for why), not a queued
 * batch job; a much larger list would need a different design. */
export class BulkInviteUsersDto {
  @ApiProperty({ type: [BulkInviteUserRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BulkInviteUserRowDto)
  rows!: BulkInviteUserRowDto[];
}

export class BulkInviteResultRowDto {
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['created', 'skipped', 'failed'] }) status!: 'created' | 'skipped' | 'failed';
  @ApiPropertyOptional() reason?: string;
}

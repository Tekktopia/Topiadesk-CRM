import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { CaseManagementEntityType } from '@topiadesk/db';

/** PUT /crm/accounts/:id/sla-overrides — upserts the (account, entityType) override, one call per entity type. */
export class UpsertAccountSlaOverrideDto {
  @ApiProperty({ enum: CaseManagementEntityType }) @IsEnum(CaseManagementEntityType) entityType!: CaseManagementEntityType;
  @ApiProperty() @IsUUID() slaPolicyId!: string;
}

export class AccountSlaOverrideResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty({ enum: CaseManagementEntityType }) entityType!: string;
  @ApiProperty() slaPolicyId!: string;
  @ApiProperty() slaPolicyName!: string;
}

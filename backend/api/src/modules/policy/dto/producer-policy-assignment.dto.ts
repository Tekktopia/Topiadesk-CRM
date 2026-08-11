import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ProducerAssignmentRole } from '@topiadesk/db';

/** Nested under a policy — policyId comes from the route param, not the body (same shape as CreatePremiumDto). */
export class CreateProducerPolicyAssignmentDto {
  @ApiProperty() @IsUUID() producerId!: string;
  @ApiPropertyOptional({ enum: ProducerAssignmentRole }) @IsOptional() @IsEnum(ProducerAssignmentRole) role?: ProducerAssignmentRole;
  @ApiProperty() @IsString() commissionSplitPercent!: string;
}

export class ProducerPolicyAssignmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty() producerId!: string;
  @ApiProperty({ enum: ProducerAssignmentRole }) role!: ProducerAssignmentRole;
  @ApiProperty() commissionSplitPercent!: string;
  @ApiProperty() createdAt!: Date;
}

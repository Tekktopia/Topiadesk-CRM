import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** Returned by POST /identity/users/:id/roles when the target Role's
 * requiredApprovalsToGrant > 1 — the grant is not yet effective, a
 * PendingRoleGrant + ApprovalChain were created instead. Distinct from
 * UserResponseDto, which is what that same endpoint returns when the grant
 * applies immediately (requiredApprovalsToGrant === 1, every role's
 * default). */
export class PendingRoleGrantResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() userName!: string;
  @ApiProperty() roleId!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty() requestedById!: string;
  @ApiProperty() requestedByName!: string;
  @ApiProperty() chainId!: string;
  @ApiProperty() approvedCount!: number;
  @ApiProperty() requiredApprovals!: number;
  @ApiProperty() createdAt!: Date;
}

export class DecideRoleGrantDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsEnum(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

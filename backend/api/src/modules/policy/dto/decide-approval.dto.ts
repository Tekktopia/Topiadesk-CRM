import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const DECISIONS = ['APPROVED', 'REJECTED'] as const;

export class DecideApprovalDto {
  @ApiProperty({ enum: DECISIONS }) @IsIn(DECISIONS) decision!: (typeof DECISIONS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const DECISIONS = ['APPROVED', 'REJECTED'] as const;

/** COMPLAINT-case closure requires a second, non-requester approver — see cases.controller.ts's request-closure/closure-decision endpoints. Own DTOs per this codebase's gated-domain convention (each domain owns its own decision DTO rather than importing another module's — see knowledge-base's decide-knowledge-approval.dto.ts's identical reasoning). */
export class RequestCaseClosureDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class DecideCaseClosureDto {
  @ApiProperty({ enum: DECISIONS }) @IsIn(DECISIONS) decision!: (typeof DECISIONS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class CaseClosureApprovalResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() requestedById!: string;
  @ApiPropertyOptional({ nullable: true }) approvedById!: string | null;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ nullable: true }) decidedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

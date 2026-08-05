import { ApiProperty } from '@nestjs/swagger';

export class AuditHashMismatchDto {
  @ApiProperty() id!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty() storedHash!: string;
  @ApiProperty() recomputedHash!: string;
}

export class AuditCheckpointVerificationDto {
  @ApiProperty() id!: string;
  @ApiProperty() checkpointAt!: Date;
  @ApiProperty({ description: 'Whether anchor_hash matches an independent recomputation of sha256(lane_hashes::text)' })
  anchorHashValid!: boolean;
}

export class AuditVerifyResponseDto {
  @ApiProperty({ nullable: true }) rangeStart!: Date | null;
  @ApiProperty() rangeEnd!: Date;
  @ApiProperty() rowsChecked!: number;
  @ApiProperty({ type: [AuditHashMismatchDto], description: 'Capped at 100 — see mismatchCount for the true total' }) mismatches!: AuditHashMismatchDto[];
  @ApiProperty() mismatchCount!: number;
  @ApiProperty({ type: [AuditCheckpointVerificationDto] }) checkpoints!: AuditCheckpointVerificationDto[];
  @ApiProperty({ description: 'true iff mismatchCount === 0 and every referenced checkpoint\'s anchor hash is valid' }) verified!: boolean;
}

import { ApiProperty } from '@nestjs/swagger';
import { AuditAction } from '@topiadesk/db';

export class AuditLogActorDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() email!: string;
}

export class AuditLogResponseDto {
  @ApiProperty({ description: 'BigInt chain sequence id, serialized as string' }) id!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({ enum: AuditAction }) action!: AuditAction;
  @ApiProperty({ nullable: true }) actorUserId!: string | null;
  @ApiProperty({ type: AuditLogActorDto, nullable: true }) actorUser!: AuditLogActorDto | null;
  @ApiProperty({ nullable: true }) actorSystemJob!: string | null;
  @ApiProperty({ nullable: true }) actorIp!: string | null;
  @ApiProperty({ nullable: true, description: 'Trigger-captured column diff — shape varies by entityType' }) changedFields!: unknown;
  @ApiProperty() chainLane!: number;
  @ApiProperty({ nullable: true }) prevHash!: string | null;
  @ApiProperty() currentHash!: string;
  @ApiProperty() createdAt!: Date;
}

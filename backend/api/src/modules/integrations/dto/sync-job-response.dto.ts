import { ApiProperty } from '@nestjs/swagger';

export class SyncJobResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() connectorId!: string;
  @ApiProperty() jobType!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) startedAt!: Date | null;
  @ApiProperty({ nullable: true }) completedAt!: Date | null;
  @ApiProperty() recordsProcessed!: number;
  @ApiProperty() recordsSucceeded!: number;
  @ApiProperty() recordsFailed!: number;
  @ApiProperty({ nullable: true }) triggeredBy!: string | null;
  @ApiProperty() correlationId!: string;
  @ApiProperty() createdAt!: Date;
}

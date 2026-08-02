import { ApiProperty } from '@nestjs/swagger';

export class IntegrationLogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) syncJobId!: string | null;
  @ApiProperty() connectorId!: string;
  @ApiProperty() level!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ nullable: true }) externalRecordId!: string | null;
  @ApiProperty({ nullable: true }) internalEntityType!: string | null;
  @ApiProperty({ nullable: true }) internalEntityId!: string | null;
  @ApiProperty() message!: string;
  @ApiProperty() createdAt!: Date;
}

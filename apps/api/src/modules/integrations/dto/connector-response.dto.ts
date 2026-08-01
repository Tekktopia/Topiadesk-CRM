import { ApiProperty } from '@nestjs/swagger';

export class ConnectorResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() connectorType!: string;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty({ nullable: true }) lastSuccessfulSyncAt!: Date | null;
}

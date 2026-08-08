import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectorResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() connectorType!: string;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty() syncDirection!: string;
  @ApiPropertyOptional({ nullable: true }) pollingIntervalMinutes!: number | null;
  @ApiPropertyOptional({ nullable: true }) webhookPath!: string | null;
  /** Secret-shaped keys (apiKey/webhookSecret/webhookUrl/clientSecret/...,
   * recursively, anywhere in the object) are masked — see
   * redactConnectorConfig() in integrations.controller.ts. A create/update
   * call still accepts the real values; they're just never echoed back. */
  @ApiProperty({ type: 'object', additionalProperties: true }) config!: Record<string, unknown>;
  @ApiProperty({ nullable: true }) lastSuccessfulSyncAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

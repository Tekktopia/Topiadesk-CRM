import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { ConnectorType, SyncDirection } from '@topiadesk/db';

export class CreateConnectorDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: ConnectorType }) @IsEnum(ConnectorType) connectorType!: ConnectorType;
  @ApiProperty({ enum: SyncDirection }) @IsEnum(SyncDirection) syncDirection!: SyncDirection;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() pollingIntervalMinutes?: number;
  @ApiPropertyOptional({ description: 'Only set this if the connector receives inbound webhooks — must be unique.' })
  @IsOptional()
  @IsString()
  webhookPath?: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Shape varies by connectorType. TEAMS_WEBHOOK: { webhookUrl }. SEAMLESSHR: { seamlessHR: { apiBaseUrl, apiKey } }. MOCK_STUB: { fixtureEndpoint }. Inbound-webhook-receiving connectors also need { webhookSecret } to match webhookPath.',
  })
  @IsObject()
  config!: Record<string, unknown>;
}

export class UpdateConnectorDto extends PartialType(CreateConnectorDto) {}

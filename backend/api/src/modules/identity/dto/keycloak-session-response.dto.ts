import { ApiProperty } from '@nestjs/swagger';

/** Read-only proxy shape of Keycloak's UserSessionRepresentation (Admin REST API) — see keycloak-admin.service.ts. */
export class KeycloakSessionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() ipAddress!: string;
  @ApiProperty({ description: 'Epoch milliseconds' }) start!: number;
  @ApiProperty({ description: 'Epoch milliseconds' }) lastAccess!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' }, description: 'clientId -> clientSessionId' })
  clients!: Record<string, string>;
}

export class ForceLogoutResponseDto {
  @ApiProperty() status!: string;
}

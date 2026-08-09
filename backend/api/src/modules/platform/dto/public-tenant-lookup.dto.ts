import { ApiProperty } from '@nestjs/swagger';

export class PublicTenantLookupResponseDto {
  @ApiProperty() keycloakRealm!: string;
}

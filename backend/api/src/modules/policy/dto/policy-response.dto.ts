import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PolicyResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyNumber!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() carrierId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() lineOfBusiness!: string;
  @ApiPropertyOptional() sumInsured?: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty() inceptionDate!: Date;
  @ApiProperty() expiryDate!: Date;
  @ApiPropertyOptional() brokerOfRecordId?: string | null;
  @ApiPropertyOptional() currentVersionId?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

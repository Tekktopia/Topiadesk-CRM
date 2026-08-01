import { ApiProperty } from '@nestjs/swagger';

export class PolicyResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyNumber!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() carrierId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() lineOfBusiness!: string;
  @ApiProperty() expiryDate!: Date;
}

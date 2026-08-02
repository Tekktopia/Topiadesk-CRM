import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RenewalScheduleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() policyId!: string;
  @ApiProperty() renewalDueDate!: Date;
  @ApiProperty({ type: [Number] }) alertThresholds!: number[];
  @ApiProperty() status!: string;
  @ApiPropertyOptional() assignedToId?: string | null;
  @ApiPropertyOptional() lastAlertSentAt?: Date | null;
  @ApiProperty() nextAlertDueAt!: Date;
  @ApiPropertyOptional() renewalMeetingDate?: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

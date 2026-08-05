import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddWatcherDto {
  @ApiProperty() @IsUUID() userId!: string;
}

export class CaseWatcherResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) claimId!: string | null;
  @ApiProperty({ nullable: true }) caseId!: string | null;
  @ApiProperty() userId!: string;
  @ApiProperty() createdAt!: Date;
}

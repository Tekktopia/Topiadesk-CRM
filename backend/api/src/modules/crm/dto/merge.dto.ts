import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MergeRequestDto {
  @ApiProperty({ description: 'Id of the record to merge into :id (the winner) and delete' }) @IsUUID() loserId!: string;
}

export class MergeResponseDto {
  @ApiProperty() winnerId!: string;
  @ApiProperty() loserId!: string;
}

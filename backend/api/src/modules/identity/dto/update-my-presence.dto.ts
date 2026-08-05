import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateMyPresenceDto {
  @ApiProperty({ enum: ['ONLINE', 'AWAY', 'OFFLINE'] })
  @IsIn(['ONLINE', 'AWAY', 'OFFLINE'])
  presenceStatus!: 'ONLINE' | 'AWAY' | 'OFFLINE';
}

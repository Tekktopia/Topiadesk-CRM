import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ScheduledReportDeliveryChannel, ScheduledReportFormat, ScheduledReportFrequency } from '@topiadesk/db';

export class ScheduledReportRecipientInputDto {
  @ApiProperty({ required: false, description: 'Required for EMAIL/IN_APP channels' })
  @ValidateIf((o: ScheduledReportRecipientInputDto) => o.channel !== 'WEBHOOK')
  @IsUUID()
  userId?: string;

  @ApiProperty({ enum: ScheduledReportDeliveryChannel }) @IsIn(Object.values(ScheduledReportDeliveryChannel)) channel!: ScheduledReportDeliveryChannel;

  @ApiProperty({ required: false, description: 'Required for WEBHOOK channel' })
  @ValidateIf((o: ScheduledReportRecipientInputDto) => o.channel === 'WEBHOOK')
  @IsUrl({ require_tld: false })
  webhookUrl?: string;
}

export class CreateScheduledReportDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ description: 'Must be a key returned by GET /reports' }) @IsString() @MinLength(1) reportKey!: string;
  @ApiProperty({ type: Object, description: 'Validated server-side against the target report\'s own filterSchema' }) @IsObject() filters!: Record<string, unknown>;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dimension?: string;
  @ApiProperty({ enum: ScheduledReportFormat, default: 'PDF' }) @IsIn(Object.values(ScheduledReportFormat)) format!: ScheduledReportFormat;
  @ApiProperty({ enum: ScheduledReportFrequency }) @IsIn(Object.values(ScheduledReportFrequency)) frequency!: ScheduledReportFrequency;
  @ApiProperty({ required: false, minimum: 0, maximum: 6, description: '0=Sunday, used for WEEKLY' }) @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number;
  @ApiProperty({ required: false, minimum: 1, maximum: 31, description: 'Used for MONTHLY/QUARTERLY, clamped to the shortest month' }) @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number;
  @ApiProperty({ required: false, minimum: 0, maximum: 23, default: 6 }) @IsOptional() @IsInt() @Min(0) @Max(23) hourOfDayUtc?: number;

  @ApiProperty({ type: [ScheduledReportRecipientInputDto] })
  @ValidateNested({ each: true })
  @Type(() => ScheduledReportRecipientInputDto)
  @ArrayMinSize(1)
  recipients!: ScheduledReportRecipientInputDto[];
}

export class UpdateScheduledReportDto extends PartialType(CreateScheduledReportDto) {
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ScheduledReportRecipientResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty() channel!: string;
  @ApiProperty({ nullable: true }) webhookUrl!: string | null;
}

export class ScheduledReportResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() reportKey!: string;
  @ApiProperty({ type: Object }) filters!: Record<string, unknown>;
  @ApiProperty({ nullable: true }) dimension!: string | null;
  @ApiProperty() format!: string;
  @ApiProperty() frequency!: string;
  @ApiProperty({ nullable: true }) dayOfWeek!: number | null;
  @ApiProperty({ nullable: true }) dayOfMonth!: number | null;
  @ApiProperty() hourOfDayUtc!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() ownerId!: string;
  @ApiProperty() nextRunAt!: Date;
  @ApiProperty({ nullable: true }) lastRunAt!: Date | null;
  @ApiProperty({ type: [ScheduledReportRecipientResponseDto] }) recipients!: ScheduledReportRecipientResponseDto[];
  @ApiProperty() createdAt!: Date;
}

export class ScheduledReportRunResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) scheduledReportId!: string | null;
  @ApiProperty() reportKey!: string;
  @ApiProperty() format!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) rowCount!: number | null;
  @ApiProperty({ nullable: true }) errorMessage!: string | null;
  @ApiProperty({ nullable: true }) startedAt!: Date | null;
  @ApiProperty({ nullable: true }) completedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class ScheduledReportRunDownloadResponseDto {
  @ApiProperty() downloadUrl!: string;
  @ApiProperty() expiresInSeconds!: number;
}

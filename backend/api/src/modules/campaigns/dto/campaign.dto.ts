import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CampaignAbTestMetric, CampaignChannel, CampaignRecipientStatus, CampaignStatus } from '@topiadesk/db';

export class CreateCampaignVariantDto {
  @ApiProperty() @IsString() @MinLength(1) label!: string;
  @ApiProperty() @IsUUID() templateId!: string;
  @ApiProperty({ minimum: 1, maximum: 100 }) @IsInt() @Min(1) @Max(100) splitPercent!: number;
}

export class CreateCampaignDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: CampaignChannel }) @IsEnum(CampaignChannel) channel!: CampaignChannel;
  @ApiProperty({ required: false, description: 'Required unless abTestEnabled with variants supplied' }) @IsOptional() @IsUUID() templateId?: string;
  @ApiProperty() @IsUUID() segmentId!: string;

  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() abTestEnabled?: boolean;
  @ApiProperty({ required: false, minimum: 1, maximum: 100, description: '% of the audience in the initial test sample; remainder goes to the decided winner' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  abTestSamplePercent?: number;
  @ApiProperty({ enum: CampaignAbTestMetric, required: false }) @IsOptional() @IsEnum(CampaignAbTestMetric) abTestMetric?: CampaignAbTestMetric;

  @ApiProperty({ type: [CreateCampaignVariantDto], required: false, description: 'Required when abTestEnabled — splitPercent must sum to 100' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateCampaignVariantDto)
  variants?: CreateCampaignVariantDto[];
}

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}

export class ScheduleCampaignDto {
  @ApiProperty({ description: 'ISO 8601 timestamp — when the worker\'s dispatch poll should send this campaign' })
  @IsDateString()
  scheduledSendAt!: string;
}

export class CampaignQueryDto {
  @ApiProperty({ enum: CampaignStatus, required: false }) @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
  @ApiProperty({ enum: CampaignChannel, required: false }) @IsOptional() @IsEnum(CampaignChannel) channel?: CampaignChannel;
}

export class CampaignVariantResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() templateId!: string;
  @ApiProperty() splitPercent!: number;
}

export class CampaignResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: CampaignChannel }) channel!: CampaignChannel;
  @ApiProperty({ enum: CampaignStatus }) status!: CampaignStatus;
  @ApiProperty({ nullable: true }) templateId!: string | null;
  @ApiProperty({ nullable: true }) segmentId!: string | null;
  @ApiProperty({ nullable: true }) scheduledSendAt!: Date | null;
  @ApiProperty({ nullable: true }) sentAt!: Date | null;
  @ApiProperty() abTestEnabled!: boolean;
  @ApiProperty({ nullable: true }) abTestSamplePercent!: number | null;
  @ApiProperty({ enum: CampaignAbTestMetric, nullable: true }) abTestMetric!: CampaignAbTestMetric | null;
  @ApiProperty({ nullable: true }) abTestWinnerVariantId!: string | null;
  @ApiProperty({ nullable: true }) abTestDecidedAt!: Date | null;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: [CampaignVariantResponseDto], required: false }) variants?: CampaignVariantResponseDto[];
}

export class CampaignRecipientResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() contactId!: string;
  @ApiProperty({ nullable: true }) variantId!: string | null;
  @ApiProperty({ enum: CampaignRecipientStatus }) status!: CampaignRecipientStatus;
  @ApiProperty({ nullable: true }) externalMessageId!: string | null;
  @ApiProperty({ nullable: true }) queuedAt!: Date | null;
  @ApiProperty({ nullable: true }) sentAt!: Date | null;
  @ApiProperty({ nullable: true }) deliveredAt!: Date | null;
  @ApiProperty({ nullable: true }) openedAt!: Date | null;
  @ApiProperty({ nullable: true }) clickedAt!: Date | null;
  @ApiProperty({ nullable: true }) bouncedAt!: Date | null;
  @ApiProperty({ nullable: true }) unsubscribedAt!: Date | null;
  @ApiProperty({ nullable: true }) failureReason!: string | null;
}

export class CampaignPerformanceResponseDto {
  @ApiProperty() totalRecipients!: number;
  @ApiProperty() sent!: number;
  @ApiProperty() delivered!: number;
  @ApiProperty() opened!: number;
  @ApiProperty() clicked!: number;
  @ApiProperty() bounced!: number;
  @ApiProperty() failed!: number;
  @ApiProperty() unsubscribed!: number;
  @ApiProperty({ description: 'delivered / sent, 0 if none sent' }) deliveryRate!: number;
  @ApiProperty({ description: 'opened / delivered, 0 if none delivered' }) openRate!: number;
  @ApiProperty({ description: 'clicked / delivered, 0 if none delivered' }) clickRate!: number;
  @ApiProperty({ description: 'bounced / sent, 0 if none sent' }) bounceRate!: number;
  @ApiProperty({ type: [Object], required: false, description: 'Per-variant breakdown, present only for A/B-test campaigns' })
  byVariant?: Array<{ variantId: string; label: string; sent: number; opened: number; clicked: number; openRate: number; clickRate: number }>;
}

export class AbTestDecideWinnerResponseDto {
  @ApiProperty() abTestWinnerVariantId!: string;
  @ApiProperty() abTestDecidedAt!: Date;
  @ApiProperty() remainingRecipientsEnqueued!: number;
}

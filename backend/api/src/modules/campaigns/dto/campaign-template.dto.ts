import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CampaignChannel } from '@topiadesk/db';

export class CreateCampaignTemplateDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ enum: CampaignChannel }) @IsEnum(CampaignChannel) channel!: CampaignChannel;
  @ApiProperty({ required: false }) @IsOptional() @IsString() subject?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() bodyHtml?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() bodyText?: string;

  @ApiProperty({ type: [String], required: false, description: 'Merge field keys this template uses — validated against GET /campaign-templates/merge-fields' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  mergeFields?: string[];

  @ApiProperty({ required: false, description: 'Required when channel = WHATSAPP (pre-approved WhatsApp Business template name)' })
  @IsOptional()
  @IsString()
  whatsappTemplateName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  whatsappTemplateLang?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCampaignTemplateDto extends PartialType(CreateCampaignTemplateDto) {}

export class CampaignTemplateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: CampaignChannel }) channel!: CampaignChannel;
  @ApiProperty({ nullable: true }) subject!: string | null;
  @ApiProperty({ nullable: true }) bodyHtml!: string | null;
  @ApiProperty({ nullable: true }) bodyText!: string | null;
  @ApiProperty({ type: [String] }) mergeFields!: string[];
  @ApiProperty({ nullable: true }) whatsappTemplateName!: string | null;
  @ApiProperty({ nullable: true }) whatsappTemplateLang!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class MergeFieldDescriptorResponseDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() example!: string;
}

import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AccountRelationshipType } from '@topiadesk/db';

export class CreateAccountRelationshipDto {
  @ApiProperty({ description: 'The other account in the relationship (this account is accountA).' })
  @IsUUID()
  relatedAccountId!: string;

  @ApiProperty({ enum: AccountRelationshipType }) @IsEnum(AccountRelationshipType) relationshipType!: AccountRelationshipType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

export class UpdateAccountRelationshipDto extends PartialType(CreateAccountRelationshipDto) {}

export class AccountRelationshipResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() accountAId!: string;
  @ApiProperty() accountAName!: string;
  @ApiProperty() accountBId!: string;
  @ApiProperty() accountBName!: string;
  @ApiProperty() relationshipType!: string;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: Date;
}

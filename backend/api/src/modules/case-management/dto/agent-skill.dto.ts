import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateAgentSkillDto {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty() @IsString() @MinLength(1) skillTag!: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 5 }) @IsOptional() @IsInt() @Min(1) @Max(5) proficiency?: number;
}

export class UpdateAgentSkillDto extends PartialType(CreateAgentSkillDto) {}

export class AgentSkillResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() skillTag!: string;
  @ApiProperty({ nullable: true }) proficiency!: number | null;
}

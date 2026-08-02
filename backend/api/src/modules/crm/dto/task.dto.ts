import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { TaskPriority, TaskStatus } from '@topiadesk/db';

export class CreateTaskDto {
  @ApiProperty() @IsString() @MinLength(1) title!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() dueDate?: string;
  @ApiProperty({ enum: TaskPriority, required: false }) @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @ApiProperty({ enum: TaskStatus, required: false }) @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiProperty({ required: false, description: 'Defaults to the calling user' }) @IsOptional() @IsUUID() assigneeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() policyId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() opportunityId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() leadId?: string;
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

export class TaskQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() assigneeId?: string;
  @ApiProperty({ enum: TaskStatus, required: false }) @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() dueBefore?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() dueAfter?: string;
}

export class TaskResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) dueDate!: Date | null;
  @ApiProperty() priority!: string;
  @ApiProperty() status!: string;
  @ApiProperty() assigneeId!: string;
  @ApiProperty({ nullable: true }) accountId!: string | null;
  @ApiProperty({ nullable: true }) policyId!: string | null;
  @ApiProperty({ nullable: true }) opportunityId!: string | null;
  @ApiProperty({ nullable: true }) leadId!: string | null;
  @ApiProperty({ nullable: true }) completedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

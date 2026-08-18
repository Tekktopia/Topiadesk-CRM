import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
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
  @ApiProperty({ required: false, description: 'Links this task to a Case — powers the ticket detail page\'s "Tasks" related-list' }) @IsOptional() @IsUUID() caseId?: string;
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

export class TaskQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() assigneeId?: string;
  @ApiProperty({ enum: TaskStatus, required: false }) @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() dueBefore?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() dueAfter?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() caseId?: string;
  @ApiProperty({ required: false, description: 'Powers an Account detail page\'s Tasks tab — previously had to be client-filtered from the full list.' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
  @ApiPropertyOptional({ description: 'Free-text search across task title and description.' })
  @IsOptional()
  @IsString()
  q?: string;
  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
  @ApiPropertyOptional({ description: 'Max rows to return (default 100).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
  @ApiPropertyOptional({ description: 'Rows to skip, for pagination.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

/**
 * Task-list aggregates.
 *
 * `overdue` is the number this page exists to surface: OPEN/IN_PROGRESS with
 * a dueDate in the past. Tasks with no due date are never overdue — they are
 * counted in `noDueDate` instead of being silently lumped into either side,
 * because "undated" and "on time" are different problems.
 */
export class TaskStatsResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Neither COMPLETED nor CANCELLED.' }) open!: number;
  @ApiProperty() completed!: number;
  @ApiProperty({ description: 'Still open with a dueDate strictly before today.' }) overdue!: number;
  @ApiProperty({ description: 'Still open and due today.' }) dueToday!: number;
  @ApiProperty({ description: 'Still open with no dueDate set.' }) noDueDate!: number;
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
  @ApiProperty({ nullable: true }) caseId!: string | null;
  @ApiProperty({ nullable: true }) completedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class BulkAssignTasksDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() assigneeId!: string;
}

export class BulkUpdateTasksDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty({ enum: TaskStatus, required: false }) @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiProperty({ enum: TaskPriority, required: false }) @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
}

export class BulkDeleteTasksDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
}

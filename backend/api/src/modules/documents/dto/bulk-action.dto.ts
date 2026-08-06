import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/**
 * Shared shape for every bulk endpoint in this module — mirrors
 * crm/dto/bulk-action.dto.ts exactly, duplicated rather than imported
 * across the module boundary per this codebase's existing
 * module-independence discipline.
 */
export class BulkActionResponseDto {
  @ApiProperty({ type: [String] }) requested!: string[];
  @ApiProperty({ type: [String] }) updated!: string[];
  @ApiProperty({ type: [String] }) skipped!: string[];
}

export class BulkArchiveDocumentsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
}

export class BulkCategorizeDocumentsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) ids!: string[];
  @ApiProperty() @IsUUID() categoryId!: string;
}

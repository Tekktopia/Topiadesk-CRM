import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** What a producer's "book" is made of, for the purposes of a handover. */
export const BOOK_ENTITIES = ['accounts', 'opportunities', 'leads', 'tasks', 'renewals'] as const;
export type BookEntity = (typeof BOOK_ENTITIES)[number];

export class BookPreviewQueryDto {
  @ApiProperty({ description: 'The departing user whose book is being counted.' })
  @IsUUID()
  fromUserId!: string;
}

export class TransferBookDto {
  @ApiProperty({ description: 'The departing user.' }) @IsUUID() fromUserId!: string;
  @ApiProperty({ description: 'Who inherits the book.' }) @IsUUID() toUserId!: string;

  /**
   * Which parts of the book to move. Explicit rather than all-or-nothing
   * because a handover is often partial — a leaver's open opportunities may
   * go to one colleague while their accounts go to another, and doing that
   * as two scoped transfers is safer than one sweeping move followed by
   * manual correction.
   */
  @ApiPropertyOptional({ enum: BOOK_ENTITIES, isArray: true, default: BOOK_ENTITIES })
  @IsOptional()
  @IsArray()
  @IsIn(BOOK_ENTITIES, { each: true })
  entities?: BookEntity[];

  /**
   * Recorded on the audit trail. A book transfer moves a whole client
   * portfolio between people, which is exactly the kind of change someone
   * asks "why did this happen" about six months later.
   */
  @ApiPropertyOptional({ description: 'Why the book moved — stored on the audit record.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BookCountsDto {
  @ApiProperty() accounts!: number;
  @ApiProperty() opportunities!: number;
  @ApiProperty() leads!: number;
  @ApiProperty({ description: 'Open tasks only — completed work is history and does not move.' }) tasks!: number;
  @ApiProperty({ description: 'Renewal schedules assigned to this user.' }) renewals!: number;
  @ApiProperty({ description: 'Everything above, summed.' }) total!: number;
}

export class BookTransferResultDto {
  @ApiProperty() fromUserId!: string;
  @ApiProperty() toUserId!: string;
  @ApiProperty({ description: 'What actually moved, by entity.' }) moved!: BookCountsDto;
}

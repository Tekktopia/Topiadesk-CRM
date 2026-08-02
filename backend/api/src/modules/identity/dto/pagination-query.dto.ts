import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Shared list-endpoint pagination — capped `take` so an unbounded query can't be used to page-drain a table. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number = 50;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number = 0;
}

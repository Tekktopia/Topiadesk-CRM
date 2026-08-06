import { ApiProperty } from '@nestjs/swagger';

export class OperationalKpiResponseDto {
  @ApiProperty() openOpportunities!: number;
  @ApiProperty() pipelineValue!: string;
  @ApiProperty() renewalsDueNext90Days!: number;
  @ApiProperty() activeClients!: number;
  @ApiProperty({ description: 'Opportunities with pipelineStage.isWon and actualCloseDate in the current calendar month' }) wonThisMonthCount!: number;
  @ApiProperty({ description: 'Sum of amount for wonThisMonthCount' }) wonThisMonthValue!: string;
  @ApiProperty({ description: 'won / (won + lost) among all opportunities with a non-null actualCloseDate, all-time. Null when there are none yet.', nullable: true })
  winRate!: number | null;
}

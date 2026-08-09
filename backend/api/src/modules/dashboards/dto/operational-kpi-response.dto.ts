import { ApiProperty } from '@nestjs/swagger';

/** Grouped by the opportunity owner's User.departmentId — Opportunity has
 * no direct departmentId of its own. Department, not Team: Department is
 * populated on every User by default, Team isn't seeded until an admin
 * configures it, so this is the dimension that shows real data out of the
 * box for the sales/pipeline side of the app. */
export class DepartmentPipelineBreakdownDto {
  @ApiProperty() departmentId!: string;
  @ApiProperty() departmentName!: string;
  @ApiProperty() openOpportunityCount!: number;
  @ApiProperty({ description: 'Sum of amount for this department\'s open opportunities' }) pipelineValue!: string;
  @ApiProperty() wonThisMonthCount!: number;
  @ApiProperty({ description: 'Sum of amount for this department\'s wonThisMonthCount' }) wonThisMonthValue!: string;
}

export class OperationalKpiResponseDto {
  @ApiProperty() openOpportunities!: number;
  @ApiProperty() pipelineValue!: string;
  @ApiProperty() renewalsDueNext90Days!: number;
  @ApiProperty() activeClients!: number;
  @ApiProperty({ description: 'Opportunities with pipelineStage.isWon and actualCloseDate in the current calendar month' }) wonThisMonthCount!: number;
  @ApiProperty({ description: 'Sum of amount for wonThisMonthCount' }) wonThisMonthValue!: string;
  @ApiProperty({ description: 'won / (won + lost) among all opportunities with a non-null actualCloseDate, all-time. Null when there are none yet.', nullable: true })
  winRate!: number | null;
  @ApiProperty({ type: [DepartmentPipelineBreakdownDto] }) byDepartment!: DepartmentPipelineBreakdownDto[];
}

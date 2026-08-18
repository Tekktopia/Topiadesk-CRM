import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class OperationalKpiQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() ownerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lineOfBusiness?: string;
}

export class LossReasonBreakdownDto {
  @ApiProperty() reason!: string;
  @ApiProperty() count!: number;
}

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
  @ApiProperty({ description: 'All accounts, any status (activeClients above is CLIENT-status only)' }) totalAccounts!: number;
  @ApiProperty({ description: 'Leads with createdAt in the current calendar month' }) newLeadsThisMonth!: number;
  @ApiProperty({ description: 'CONVERTED leads / all-time lead count. Null when there are no leads yet.', nullable: true })
  leadConversionRate!: number | null;
  @ApiProperty({ description: 'Policies with status BOUND, ISSUED, or RENEWED and expiryDate in the future' }) activePolicies!: number;
  @ApiProperty({ description: 'pipelineValue / openOpportunities. "0.00" when there are no open opportunities.' }) avgDealSize!: string;
  @ApiProperty({ description: 'Opportunities with pipelineStage.isLost and actualCloseDate in the current calendar month' }) lostThisMonthCount!: number;
  @ApiProperty({ type: [DepartmentPipelineBreakdownDto] }) byDepartment!: DepartmentPipelineBreakdownDto[];
  @ApiProperty({ type: [LossReasonBreakdownDto], description: 'Top 5 lost reasons by count, all-time, plus an "Other" bucket for the rest' })
  lossReasonBreakdown!: LossReasonBreakdownDto[];
}

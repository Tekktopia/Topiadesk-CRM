import { ApiProperty } from '@nestjs/swagger';

export class RenderedDashboardWidgetDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() reportKey!: string;
  @ApiProperty() chartType!: string;
  // Typed `unknown`, not `Record<string, unknown>` — the real runtime
  // shape is @topiadesk/reports' ReportResult (columns/rows/totalRowCount/
  // generatedAt), which has no string index signature, so an
  // index-signature type here would reject it structurally.
  @ApiProperty({ type: Object, required: false, description: 'Present when the report executed successfully — shape is @topiadesk/reports\' ReportResult' })
  result?: unknown;
  @ApiProperty({ required: false, description: 'Present instead of `result` when this one widget failed to render — the rest of the dashboard still returns' })
  error?: string;
}

export class RenderedDashboardResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: Object }) layoutConfig!: Record<string, unknown>;
  @ApiProperty({ type: [RenderedDashboardWidgetDto] }) widgets!: RenderedDashboardWidgetDto[];
}

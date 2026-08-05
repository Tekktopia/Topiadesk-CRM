import { ApiProperty } from '@nestjs/swagger';

export class ReportDimensionDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
}

export class ReportMeasureDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: ['sum', 'count', 'avg'] }) aggregate!: string;
  @ApiProperty({ enum: ['currency', 'number', 'percent', 'days'] }) format!: string;
}

/** filterSchema is rendered as a JSON Schema object (via zod-to-json-schema) so a generic frontend filter builder can introspect it without knowing about zod. */
export class ReportCatalogEntryDto {
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: ['FINANCE', 'SALES', 'RENEWALS', 'CLAIMS', 'COMPLIANCE', 'PRODUCTIVITY', 'MARKETING'] }) category!: string;
  @ApiProperty({ type: Object }) filterSchema!: Record<string, unknown>;
  @ApiProperty({ type: [ReportDimensionDto] }) allowedDimensions!: ReportDimensionDto[];
  @ApiProperty({ type: [ReportMeasureDto] }) measures!: ReportMeasureDto[];
  @ApiProperty({ enum: ['bar', 'stackedBar', 'line', 'funnel', 'table', 'treemap', 'gauge'] }) defaultChartType!: string;
}

export class ReportColumnDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() format!: string;
}

export class ReportResultDto {
  @ApiProperty({ type: [ReportColumnDto] }) columns!: ReportColumnDto[];
  @ApiProperty({ type: [Object] }) rows!: Array<Record<string, unknown>>;
  @ApiProperty() totalRowCount!: number;
  @ApiProperty() generatedAt!: string;
}

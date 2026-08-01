import { ApiProperty } from '@nestjs/swagger';

export class OperationalKpiResponseDto {
  @ApiProperty() openOpportunities!: number;
  @ApiProperty() pipelineValue!: string;
  @ApiProperty() renewalsDueNext90Days!: number;
  @ApiProperty() activeClients!: number;
}

import { ApiProperty } from '@nestjs/swagger';

export class DocumentCategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

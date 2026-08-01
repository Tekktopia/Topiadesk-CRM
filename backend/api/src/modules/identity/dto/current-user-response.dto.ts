import { ApiProperty } from '@nestjs/swagger';

export class CurrentUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ nullable: true }) departmentId!: string | null;
  @ApiProperty({ nullable: true }) branchId!: string | null;
}

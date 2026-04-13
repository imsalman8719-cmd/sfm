// ─── DTO ──────────────────────────────────────────────────────────────────────
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsUUID,
} from 'class-validator';
import { OptionalUUID } from '../../../common/decorators/optional-uuid.decorator';

export class CreateClassDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsString() @IsNotEmpty() grade: string;
  @ApiPropertyOptional() @IsOptional() @IsString() section?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxCapacity?: number;
  @ApiProperty() @IsUUID() academicYearId: string;
  @OptionalUUID('Leave empty for no class teacher') classTeacherId?: string;
}

export class UpdateClassDto extends PartialType(CreateClassDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
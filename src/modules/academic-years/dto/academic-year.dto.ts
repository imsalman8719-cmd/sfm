// ─── DTOs ────────────────────────────────────────────────────────────────────
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsDateString, IsOptional, IsBoolean,
  IsNumber, Min, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAcademicYearDto {
  @ApiProperty({ example: '2024-2025' }) @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCurrent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) feeTarget?: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() monthlyTargets?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsObject() quarterlyTargets?: Record<string, number>;
}

export class UpdateAcademicYearDto extends PartialType(CreateAcademicYearDto) {
  
}

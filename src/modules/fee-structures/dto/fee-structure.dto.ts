import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsNumber, IsBoolean,
  IsArray, IsInt, Min, Max, ValidateNested, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FeeCategory, FeeFrequency, DiscountType, DiscountCategory,
} from '../../../common/enums';

export class InstallmentDto {
  @ApiProperty() @IsInt() installmentNo: number;
  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiProperty() @IsString() label: string;
}

export class CreateFeeStructureDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: FeeCategory }) @IsEnum(FeeCategory) category: FeeCategory;
  @ApiProperty({ enum: FeeFrequency }) @IsEnum(FeeFrequency) frequency: FeeFrequency;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMandatory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(31) dueDayOfMonth?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() lateFeeEnabled?: boolean;
  @ApiPropertyOptional({ enum: DiscountType }) @IsOptional() @IsEnum(DiscountType) lateFeeType?: DiscountType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) lateFeeValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) gracePeriodDays?: number;
  @ApiPropertyOptional({ type: [InstallmentDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InstallmentDto) installmentSchedule?: InstallmentDto[];
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() applicableMonths?: number[];
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateFeeStructureDto extends PartialType(CreateFeeStructureDto) {}

export class CreateDiscountDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: DiscountCategory }) @IsEnum(DiscountCategory) category: DiscountCategory;
  @ApiProperty({ enum: DiscountType }) @IsEnum(DiscountType) type: DiscountType;
  @ApiProperty() @IsNumber() @Min(0) value: number;
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() feeStructureId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validUntil?: string;
}

export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {}

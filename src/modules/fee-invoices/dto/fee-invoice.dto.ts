import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsUUID, IsOptional, IsInt, IsString, IsDateString, IsNumber,
  Min, IsArray, IsEnum,
} from 'class-validator';
import { InvoiceStatus, DiscountType, WaiverStatus } from '../../../common/enums';

export class GenerateInvoiceDto {
  @ApiProperty() @IsUUID() studentId: string;
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() billingMonth?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() billingYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() billingQuarter?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() billingLabel?: string;
  @ApiProperty() @IsDateString() issueDate: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() feeStructureIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class BulkGenerateInvoiceDto {
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() billingMonth?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() billingYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() billingQuarter?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() billingLabel?: string;
  @ApiProperty() @IsDateString() issueDate: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() feeStructureIds?: string[];
}

export class CancelInvoiceDto {
  @ApiProperty() @IsString() reason: string;
}

export class ApplyWaiverDto {
  @ApiProperty() @IsUUID() invoiceId: string;
  @ApiProperty({ enum: DiscountType }) @IsEnum(DiscountType) type: DiscountType;
  @ApiProperty() @IsNumber() @Min(0) value: number;
  @ApiProperty() @IsString() reason: string;
}

export class ReviewWaiverDto {
  @ApiProperty({ enum: ['approved', 'rejected'] }) status: 'approved' | 'rejected';
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}

export class InvoiceFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() academicYearId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classId?: string;
  @ApiPropertyOptional({ enum: InvoiceStatus }) @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @ApiPropertyOptional() @IsOptional() @IsInt() billingMonth?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() billingYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() billingQuarter?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fromDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() toDate?: string;
}

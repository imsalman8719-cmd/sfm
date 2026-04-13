import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional, IsUUID, IsInt, IsDateString, IsEnum, IsString, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReportType } from '../../../common/enums';

export class DateRangeDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() fromDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() toDate?: string;
}

export class ReportFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() academicYearId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fromDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() toDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) month?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() year?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4) quarter?: number;
  @ApiPropertyOptional({ enum: ReportType }) @IsOptional() @IsEnum(ReportType) reportType?: ReportType;
}

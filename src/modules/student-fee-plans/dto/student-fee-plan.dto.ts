import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsUUID, IsEnum, IsOptional, IsBoolean, IsNumber, Min, IsString,
} from 'class-validator';
import { FeeFrequency } from '../../../common/enums';

export class CreateStudentFeePlanDto {
  @ApiProperty({ description: 'Student ID' })
  @IsUUID()
  studentId: string;

  @ApiProperty({ description: 'Fee structure to assign to this student' })
  @IsUUID()
  feeStructureId: string;

  @ApiProperty({ description: 'Academic year' })
  @IsUUID()
  academicYearId: string;

  @ApiProperty({
    enum: FeeFrequency,
    description: 'Billing frequency for this student (overrides fee structure default)',
    example: FeeFrequency.MONTHLY,
  })
  @IsEnum(FeeFrequency)
  billingFrequency: FeeFrequency;

  @ApiPropertyOptional({
    description: 'Custom amount override. Leave blank to auto-calculate from base amount × frequency multiplier',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  customAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateStudentFeePlanDto extends PartialType(CreateStudentFeePlanDto) {}

export class BulkAssignFeePlanDto {
  @ApiProperty({ type: [String], description: 'List of student IDs to assign the same plan' })
  @IsUUID(undefined, { each: true })
  studentIds: string[];

  @ApiProperty()
  @IsUUID()
  feeStructureId: string;

  @ApiProperty()
  @IsUUID()
  academicYearId: string;

  @ApiProperty({ enum: FeeFrequency })
  @IsEnum(FeeFrequency)
  billingFrequency: FeeFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  customAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

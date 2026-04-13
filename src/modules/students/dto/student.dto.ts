import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsEmail,
  IsDateString, IsEnum, IsBoolean,
} from 'class-validator';
import { AdmissionStatus, Gender } from '../../../common/enums';

export class CreateStudentDto {
  // User account fields
  @ApiProperty() @IsString() @IsNotEmpty() firstName: string;
  @ApiProperty() @IsString() @IsNotEmpty() lastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() password: string;
  @ApiPropertyOptional({ enum: Gender }) @IsOptional() @IsEnum(Gender) gender?: Gender;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateOfBirth?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;

  // Student-specific fields
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() classId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rollNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() admissionDate?: string;
  @ApiPropertyOptional({ enum: AdmissionStatus }) @IsOptional() @IsEnum(AdmissionStatus) admissionStatus?: AdmissionStatus;

  // Parent / Guardian
  @ApiPropertyOptional() @IsOptional() @IsString() fatherName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fatherPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() fatherEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() motherName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() motherPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() guardianName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() guardianPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() guardianRelation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyContact?: string;

  // Extra
  @ApiPropertyOptional() @IsOptional() @IsString() previousSchool?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() previousGrade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bloodGroup?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() religion?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() transportRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hostelRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasSiblings?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export class AssignClassDto {
  @ApiProperty() @IsUUID() classId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rollNumber?: string;
}

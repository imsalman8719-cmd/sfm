import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { UserRole, UserStatus, Gender } from '../../../common/enums';

export class CreateUserDto {
  @ApiProperty() @IsString() @IsNotEmpty() firstName: string;
  @ApiProperty() @IsString() @IsNotEmpty() lastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
  @ApiProperty({ enum: UserRole }) @IsEnum(UserRole) role: UserRole;

  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({ enum: Gender }) @IsOptional() @IsEnum(Gender) gender?: Gender;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateOfBirth?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @IsNotEmpty() oldPassword: string;
  @ApiProperty() @IsString() @MinLength(8) newPassword: string;
}

export class AdminResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(8) newPassword: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus }) @IsEnum(UserStatus) status: UserStatus;
}

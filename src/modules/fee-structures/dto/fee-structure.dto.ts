import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsBoolean, Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { DiscountCategory, DiscountType } from '../../../common/enums';

export class CreateFeeStructureDto {
  @ApiProperty({ example: 'Monthly Tuition Fee' })
  @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Core tuition fee charged every billing period' })
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ example: 8500, description: 'Monthly base amount in PKR' })
  @IsNumber() @Min(0)
  amount: number;

  @ApiProperty()
  @IsUUID()
  academicYearId: string;

  @ApiPropertyOptional({ description: 'Leave empty to apply to all classes' })
  @IsOptional() @IsUUID()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  classId?: string;

  @ApiPropertyOptional({
    description: 'true = always included in every invoice. false = student selects at enrollment.',
    default: true,
  })
  @IsOptional() @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional({
    description: 'true = charged once at enrollment (admission fee). false = recurring each billing period.',
    default: false,
  })
  @IsOptional() @IsBoolean()
  isOneTime?: boolean;
}

export class UpdateFeeStructureDto extends PartialType(CreateFeeStructureDto) {}

// ── Discounts (unchanged) ────────────────────────────────────────────────────

export class CreateDiscountDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: DiscountCategory }) category: DiscountCategory;
  @ApiProperty({ enum: DiscountType }) type: DiscountType;
  @ApiProperty() @IsNumber() @Min(0) value: number;
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() feeStructureId?: string;
  @ApiPropertyOptional() @IsOptional() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() validUntil?: string;
}

export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsBoolean, IsString, IsNumber, IsIn, Min, Max } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'Days from invoice issue date to due date (default: 10)', example: 10 })
  @IsOptional() @IsInt() @Min(1) @Max(90)
  defaultDueDays?: number;

  @ApiPropertyOptional({ description: 'Grace period in days after due date before late fee applies (default: 7, set 0 for immediate)', example: 7 })
  @IsOptional() @IsInt() @Min(0) @Max(30)
  gracePeriodDays?: number;

  @ApiPropertyOptional({ description: 'Apply late fees on overdue invoices' })
  @IsOptional() @IsBoolean()
  lateFeeEnabled?: boolean;

  @ApiPropertyOptional({ description: '"percentage" or "fixed"', enum: ['percentage', 'fixed'] })
  @IsOptional() @IsIn(['percentage', 'fixed'])
  lateFeeType?: 'percentage' | 'fixed';

  @ApiPropertyOptional({ description: 'Late fee amount — percentage (e.g. 2 = 2%) or fixed PKR amount', example: 2 })
  @IsOptional() @IsNumber() @Min(0)
  lateFeeValue?: number;

  @ApiPropertyOptional({ description: 'Days before due date to send reminder (0 = disable)', example: 3 })
  @IsOptional() @IsInt() @Min(0) @Max(30)
  reminderDaysBeforeDue?: number;

  @ApiPropertyOptional({ description: 'Nightly cron marks unpaid invoices as overdue after due date' })
  @IsOptional() @IsBoolean()
  autoOverdueMarkingEnabled?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() schoolName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() schoolAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() schoolPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currencySymbol?: string;
}

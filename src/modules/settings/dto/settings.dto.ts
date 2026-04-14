import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsBoolean, IsString, Min, Max } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'Day of month (1-28) to auto-generate monthly invoices' })
  @IsOptional() @IsInt() @Min(1) @Max(28)
  monthlyInvoiceDay?: number;

  @ApiPropertyOptional({ description: 'Days before quarter end to generate quarterly invoices' })
  @IsOptional() @IsInt() @Min(1) @Max(60)
  quarterlyInvoiceDaysBefore?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(90)
  semiAnnualInvoiceDaysBefore?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(90)
  annualInvoiceDaysBefore?: number;

  @ApiPropertyOptional({ description: 'Default number of days from issue date to due date' })
  @IsOptional() @IsInt() @Min(1) @Max(90)
  defaultDueDays?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  autoInvoiceEnabled?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  autoOverdueMarkingEnabled?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  autoReminderEnabled?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(30)
  reminderDaysBeforeDue?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  schoolName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  schoolAddress?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  schoolPhone?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  currencySymbol?: string;
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsUUID, IsNumber, IsEnum, IsDateString, IsOptional, IsString, Min,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums';

export class CreatePaymentDto {
  @ApiProperty() @IsUUID() invoiceId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiProperty() @IsDateString() paymentDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() transactionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}

export class RefundPaymentDto {
  @ApiProperty() @IsNumber() @Min(0.01) refundedAmount: number;
  @ApiProperty() @IsString() refundReason: string;
}

export class PaymentFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() studentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() invoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() academicYearId?: string;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fromDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() toDate?: string;
}

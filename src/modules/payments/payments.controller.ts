import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, RefundPaymentDto, PaymentFilterDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Record a payment against an invoice' })
  async create(@Body() dto: CreatePaymentDto, @CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.create(dto, userId), 'Payment recorded successfully');
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'List all payments with filters' })
  async findAll(@Query() pagination: PaginationDto, @Query() filters: PaymentFilterDto) {
    return ApiResponse.success(await this.service.findAll(pagination, filters));
  }

  @Get('daily-summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get collection summary for a specific date' })
  async dailySummary(@Query('date') date: string) {
    return ApiResponse.success(await this.service.getDailySummary(date));
  }

  @Get('receipt/:receiptNumber')
  @ApiOperation({ summary: 'Find payment by receipt number' })
  async findByReceipt(@Param('receiptNumber') receiptNumber: string) {
    return ApiResponse.success(await this.service.findByReceiptNumber(receiptNumber));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.findOne(id));
  }

  @Patch(':id/refund')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Refund a payment' })
  async refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return ApiResponse.success(await this.service.refund(id, dto, userId), 'Payment refunded');
  }

  @Patch(':id/verify')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Verify a payment (e.g. cheque clearance)' })
  async verify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.verify(id, userId), 'Payment verified');
  }
}

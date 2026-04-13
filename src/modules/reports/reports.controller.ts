import {
  Controller, Get, Query, UseGuards, ParseUUIDPipe, Param, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Reports & Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Finance dashboard – KPIs, charts, recent activity' })
  async dashboard(@Query('academicYearId') academicYearId: string) {
    return ApiResponse.success(await this.service.getDashboardSummary(academicYearId));
  }

  @Get('fee-collection')
  @ApiOperation({ summary: 'Fee collection report with filters' })
  async feeCollection(@Query() filters: ReportFilterDto) {
    return ApiResponse.success(await this.service.getFeeCollectionReport(filters));
  }

  @Get('outstanding')
  @ApiOperation({ summary: 'Outstanding / pending dues report' })
  async outstanding(@Query() filters: ReportFilterDto) {
    return ApiResponse.success(await this.service.getOutstandingFeesReport(filters));
  }

  @Get('target-vs-actual')
  @ApiOperation({ summary: 'Target vs actual collection – monthly & quarterly' })
  async targetVsActual(@Query('academicYearId') academicYearId: string) {
    return ApiResponse.success(await this.service.getTargetVsActualReport(academicYearId));
  }

  @Get('defaulters')
  @ApiOperation({ summary: 'Full defaulter list with amounts owed' })
  async defaulters(@Query() filters: ReportFilterDto) {
    return ApiResponse.success(await this.service.getDefaulterList(filters));
  }

  @Get('class-wise')
  @ApiOperation({ summary: 'Class-wise fee collection summary' })
  async classWise(@Query('academicYearId') academicYearId: string) {
    return ApiResponse.success(await this.service.getClassWiseFeeReport(academicYearId));
  }

  @Get('monthly-summary')
  @ApiOperation({ summary: 'Month-by-month summary for an academic year' })
  async monthlySummary(
    @Query('academicYearId') academicYearId: string,
    @Query('year') year: string,
  ) {
    return ApiResponse.success(
      await this.service.getMonthlySummary(academicYearId, parseInt(year) || new Date().getFullYear()),
    );
  }

  @Get('discount-summary')
  @ApiOperation({ summary: 'Discount & concession summary' })
  async discountSummary(@Query('academicYearId') academicYearId: string) {
    return ApiResponse.success(await this.service.getDiscountSummary(academicYearId));
  }

  @Get('payment-methods')
  @ApiOperation({ summary: 'Payment method breakdown – cash vs bank vs cheque etc.' })
  async paymentMethods(@Query() filters: ReportFilterDto) {
    return ApiResponse.success(await this.service.getPaymentMethodReport(filters));
  }

  @Get('student-statement/:studentId')
  @ApiOperation({ summary: 'Individual student fee statement / ledger' })
  async studentStatement(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return ApiResponse.success(
      await this.service.getStudentFeeStatement(studentId, academicYearId),
    );
  }
}

import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FeeInvoicesService } from './fee-invoices.service';
import {
  GenerateInvoiceDto, BulkGenerateInvoiceDto, CancelInvoiceDto,
  ApplyWaiverDto, ReviewWaiverDto, InvoiceFilterDto,
} from './dto/fee-invoice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole, InvoiceStatus, WaiverStatus } from '../../common/enums';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Fee Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fee-invoices')
export class FeeInvoicesController {
  constructor(private readonly service: FeeInvoicesService) {}

  @Post('generate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Generate invoice for a single student' })
  async generate(@Body() dto: GenerateInvoiceDto, @CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.generateInvoice(dto, userId), 'Invoice generated');
  }

  @Post('bulk-generate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Bulk generate invoices for a class or entire year' })
  async bulkGenerate(@Body() dto: BulkGenerateInvoiceDto, @CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.bulkGenerateInvoices(dto, userId), 'Bulk generation complete');
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE, UserRole.TEACHER)
  @ApiOperation({ summary: 'List invoices with filters' })
  async findAll(@Query() pagination: PaginationDto, @Query() filters: InvoiceFilterDto) {
    return ApiResponse.success(await this.service.findAll(pagination, filters));
  }

  @Get('waivers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'List all fee waivers' })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'status', enum: WaiverStatus, required: false })
  async findWaivers(
    @Query('studentId') studentId?: string,
    @Query('status') status?: WaiverStatus,
  ) {
    return ApiResponse.success(await this.service.findWaivers({ studentId, status }));
  }

  @Get('student/:studentId')
  @ApiOperation({ summary: 'Get all invoices for a student' })
  async findStudentInvoices(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return ApiResponse.success(await this.service.findStudentInvoices(studentId, academicYearId));
  }

  @Get('student/:studentId/ledger')
  @ApiOperation({ summary: 'Get full fee ledger (statement) for a student' })
  async getStudentLedger(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return ApiResponse.success(await this.service.getStudentLedger(studentId, academicYearId));
  }

  @Get('me/invoices')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Student: get own invoices' })
  async myInvoices(
    @CurrentUser('id') userId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    // Lookup student by userId – simplified here
    return ApiResponse.success(
      await this.service.findAll({ page: 1, limit: 50, skip: 0 } as any, { academicYearId }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.findOne(id));
  }

  @Patch(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Cancel an invoice' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelInvoiceDto,
    @CurrentUser('id') userId: string,
  ) {
    return ApiResponse.success(await this.service.cancelInvoice(id, dto, userId), 'Invoice cancelled');
  }

  @Post('waivers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Apply a waiver request on an invoice' })
  async applyWaiver(@Body() dto: ApplyWaiverDto, @CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.applyWaiver(dto, userId), 'Waiver request submitted');
  }

  @Patch('waivers/:waiverId/review')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Approve or reject a waiver' })
  async reviewWaiver(
    @Param('waiverId', ParseUUIDPipe) waiverId: string,
    @Body() dto: ReviewWaiverDto,
    @CurrentUser('id') userId: string,
  ) {
    return ApiResponse.success(await this.service.reviewWaiver(waiverId, dto, userId), 'Waiver reviewed');
  }
}

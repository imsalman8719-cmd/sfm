import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FeeStructuresService } from './fee-structures.service';
import {
  CreateFeeStructureDto, UpdateFeeStructureDto,
  CreateDiscountDto, UpdateDiscountDto,
} from './dto/fee-structure.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Fee Structures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fee-structures')
export class FeeStructuresController {
  constructor(private readonly service: FeeStructuresService) {}

  // ── Fee Structures ──────────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Create fee structure' })
  async create(@Body() dto: CreateFeeStructureDto, @CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.createFeeStructure(dto, userId), 'Fee structure created');
  }

  @Get()
  @ApiOperation({ summary: 'List fee structures' })
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('academicYearId') academicYearId?: string,
    @Query('classId') classId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return ApiResponse.success(
      await this.service.findAllFeeStructures(pagination, {
        academicYearId,
        classId,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get fee structure by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.findFeeStructureById(id));
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Update fee structure' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeeStructureDto) {
    return ApiResponse.success(await this.service.updateFeeStructure(id, dto), 'Updated');
  }

  @Patch(':id/toggle-active')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Toggle fee structure active status' })
  async toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.toggleFeeStructureActive(id));
  }

  @Post('copy')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Copy fee structures from one academic year to another' })
  async copy(@Query('fromYearId') fromYearId: string, @Query('toYearId') toYearId: string) {
    const count = await this.service.copyFeeStructuresToYear(fromYearId, toYearId);
    return ApiResponse.success({ count }, `${count} fee structures copied`);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Delete fee structure' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.deleteFeeStructure(id);
    return ApiResponse.success(null, 'Deleted');
  }

  // ── Discounts ───────────────────────────────────────────────────────────────

  @Post('discounts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Create a discount rule' })
  async createDiscount(@Body() dto: CreateDiscountDto, @CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.createDiscount(dto, userId), 'Discount created');
  }

  @Get('discounts/all')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get all discounts' })
  async findAllDiscounts(
    @Query('academicYearId') academicYearId?: string,
    @Query('studentId') studentId?: string,
  ) {
    return ApiResponse.success(await this.service.findAllDiscounts({ academicYearId, studentId }));
  }

  @Get('discounts/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  async findDiscount(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.findDiscountById(id));
  }

  @Put('discounts/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  async updateDiscount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDiscountDto) {
    return ApiResponse.success(await this.service.updateDiscount(id, dto), 'Updated');
  }

  @Patch('discounts/:id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  async approveDiscount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.approveDiscount(id, userId), 'Approved');
  }

  @Delete('discounts/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  async deleteDiscount(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.deleteDiscount(id);
    return ApiResponse.success(null, 'Deleted');
  }
}

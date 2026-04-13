import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto, UpdateAcademicYearDto } from './dto/academic-year.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Academic Years')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly service: AcademicYearsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create academic year' })
  async create(@Body() dto: CreateAcademicYearDto) {
    return ApiResponse.success(await this.service.create(dto), 'Academic year created');
  }

  @Get()
  @ApiOperation({ summary: 'List all academic years' })
  async findAll() {
    return ApiResponse.success(await this.service.findAll());
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current academic year' })
  async getCurrent() {
    return ApiResponse.success(await this.service.findCurrent());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get academic year by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.findOne(id));
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update academic year' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAcademicYearDto) {
    return ApiResponse.success(await this.service.update(id, dto), 'Updated');
  }

  @Patch(':id/set-current')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Set as current academic year' })
  async setCurrent(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.setCurrent(id), 'Set as current');
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete academic year' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.delete(id);
    return ApiResponse.success(null, 'Deleted');
  }
}

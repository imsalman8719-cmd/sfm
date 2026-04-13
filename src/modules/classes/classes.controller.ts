import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ClassesService } from './classes.service';
import { CreateClassDto, UpdateClassDto } from './dto/class.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Classes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('classes')
export class ClassesController {
  constructor(private readonly service: ClassesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMISSION)
  async create(@Body() dto: CreateClassDto) {
    return ApiResponse.success(await this.service.create(dto), 'Class created');
  }

  @Get()
  @ApiQuery({ name: 'academicYearId', required: false })
  async findAll(@Query() pagination: PaginationDto, @Query('academicYearId') academicYearId?: string) {
    return ApiResponse.success(await this.service.findAll(pagination, academicYearId));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.findOne(id));
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMISSION)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto) {
    return ApiResponse.success(await this.service.update(id, dto), 'Updated');
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.delete(id);
    return ApiResponse.success(null, 'Deleted');
  }
}

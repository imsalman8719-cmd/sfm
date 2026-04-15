import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { CreateStudentDto, UpdateStudentDto, AssignClassDto } from './dto/student.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole, AdmissionStatus } from '../../common/enums';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMISSION)
  @ApiOperation({ summary: 'Enroll a new student' })
  async create(@Body() dto: CreateStudentDto, @CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.create(dto, userId), 'Student enrolled successfully');
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE, UserRole.ADMISSION, UserRole.TEACHER)
  @ApiOperation({ summary: 'List all students with filters' })
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'admissionStatus', enum: AdmissionStatus, required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('academicYearId') academicYearId?: string,
    @Query('classId') classId?: string,
    @Query('admissionStatus') admissionStatus?: AdmissionStatus,
    @Query('isActive') isActive?: string,
  ) {
    const result = await this.service.findAll(pagination, {
      academicYearId,
      classId,
      admissionStatus,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
    return ApiResponse.success(result);
  }

  // @Get('defaulters')
  // @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  // @ApiOperation({ summary: 'Get list of students with outstanding dues' })
  // async getDefaulters(@Query('academicYearId') academicYearId: string) {
  //   return ApiResponse.success(await this.service.getDefaulters(academicYearId));
  // }

  @Get('me')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Get own student profile' })
  async getMyProfile(@CurrentUser('id') userId: string) {
    return ApiResponse.success(await this.service.findByUserId(userId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get student by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.findOne(id));
  }

  @Get(':id/siblings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE, UserRole.ADMISSION)
  @ApiOperation({ summary: 'Get siblings of a student' })
  async getSiblings(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.getSiblings(id));
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMISSION)
  @ApiOperation({ summary: 'Update student details' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    return ApiResponse.success(await this.service.update(id, dto), 'Student updated');
  }

  @Patch(':id/assign-class')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMISSION)
  @ApiOperation({ summary: 'Assign student to a class' })
  async assignClass(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignClassDto) {
    return ApiResponse.success(await this.service.assignClass(id, dto), 'Class assigned');
  }

  @Patch(':id/toggle-active')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMISSION)
  @ApiOperation({ summary: 'Activate / deactivate student' })
  async toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.toggleActive(id));
  }
}

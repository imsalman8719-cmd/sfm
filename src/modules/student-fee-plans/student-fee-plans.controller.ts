import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { StudentFeePlansService } from './student-fee-plans.service';
import {
  CreateStudentFeePlanDto,
  UpdateStudentFeePlanDto,
  BulkAssignFeePlanDto,
} from './dto/student-fee-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Student Fee Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('student-fee-plans')
export class StudentFeePlansController {
  constructor(private readonly service: StudentFeePlansService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Assign a fee structure to a student with a billing frequency preference',
    description: `
Assign a specific fee structure to a student with their own billing frequency.

**Examples:**
- Student A → Tuition → monthly  → PKR 8,500/month
- Student B → Tuition → quarterly → PKR 25,500/quarter (8500 × 3)
- Student C → Tuition → annual   → PKR 102,000/year (8500 × 12)

If \`customAmount\` is provided, that exact amount is used regardless of frequency.
If omitted, the system multiplies the fee structure's base monthly amount by the frequency factor.

**When generating invoices**, the system checks for a student fee plan first.
If a plan exists, only the planned fee structures are included (with the student's chosen amounts).
If no plan exists, it falls back to all applicable fee structures for the student's class.
    `,
  })
  async create(
    @Body() dto: CreateStudentFeePlanDto,
    @CurrentUser('id') userId: string,
  ) {
    return ApiResponse.success(
      await this.service.create(dto, userId),
      'Fee plan assigned to student',
    );
  }

  @Post('bulk')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Assign the same fee plan to multiple students at once',
    description: 'Useful when a group of students share the same billing frequency (e.g. all quarterly payers in Grade 5)',
  })
  async bulkAssign(
    @Body() dto: BulkAssignFeePlanDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.service.bulkAssign(dto, userId);
    return ApiResponse.success(result, `Created ${result.created} plans, skipped ${result.skipped} duplicates`);
  }

  @Get('student/:studentId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE, UserRole.ADMISSION)
  @ApiOperation({ summary: 'Get all fee plan entries for a student' })
  @ApiQuery({ name: 'academicYearId', required: false })
  async findByStudent(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return ApiResponse.success(
      await this.service.findByStudent(studentId, academicYearId),
    );
  }

  @Get('student/:studentId/preview')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Preview invoice amounts for a student based on their fee plan',
    description: 'Shows what the next invoice will look like: fee structures, frequencies, multipliers, and total amount',
  })
  async previewInvoice(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId: string,
  ) {
    return ApiResponse.success(
      await this.service.previewInvoice(studentId, academicYearId),
    );
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get a single fee plan entry' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.findOne(id));
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Update a student fee plan entry (change frequency or custom amount)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentFeePlanDto,
  ) {
    return ApiResponse.success(await this.service.update(id, dto), 'Fee plan updated');
  }

  @Patch(':id/toggle')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Activate / deactivate a fee plan entry' })
  async toggle(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.success(await this.service.toggleActive(id));
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Remove a fee plan entry from a student' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return ApiResponse.success(null, 'Fee plan removed');
  }
}

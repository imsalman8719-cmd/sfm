import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  AdminResetPasswordDto,
  UpdateUserStatusDto,
} from './dto/index';import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new user (Super Admin only)' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser('id') currentUserId: string,
  ) {
    const user = await this.usersService.create(dto, currentUserId);
    return ApiResponse.success(user, 'User created successfully');
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE, UserRole.ADMISSION)
  @ApiOperation({ summary: 'Get all users with pagination and filtering' })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('role') role?: UserRole,
  ) {
    const result = await this.usersService.findAll(pagination, role);
    return ApiResponse.success(result);
  }

  @Get('role-stats')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get user count by role' })
  async roleStats() {
    const stats = await this.usersService.countByRole();
    return ApiResponse.success(stats);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findOne(id);
    return ApiResponse.success(user);
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update user (Super Admin only)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, dto);
    return ApiResponse.success(user, 'User updated successfully');
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update user status' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const user = await this.usersService.updateStatus(id, dto.status);
    return ApiResponse.success(user, 'User status updated');
  }

  @Patch(':id/reset-password')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin reset user password' })
  async adminResetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    await this.usersService.adminResetPassword(id, dto.newPassword);
    return ApiResponse.success(null, 'Password reset successfully');
  }

  @Patch('me/change-password')
  @ApiOperation({ summary: 'Change own password' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(userId, dto.oldPassword, dto.newPassword);
    return ApiResponse.success(null, 'Password changed successfully');
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete user' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.softDelete(id);
    return ApiResponse.success(null, 'User deleted successfully');
  }
}

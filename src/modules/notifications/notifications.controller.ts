import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';
import { UserRole, NotificationEvent } from '../../common/enums';
import { ApiResponse } from '../../common/dto/api-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get('logs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get notification/email logs' })
  async getLogs(
    @Query('recipientId') recipientId?: string,
    @Query('event') event?: NotificationEvent,
  ) {
    return ApiResponse.success(await this.service.findLogs({ recipientId, event }));
  }
}

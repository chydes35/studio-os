import { Controller, Get, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('email-log')
  listLogs() {
    return this.notifications.listLogs();
  }

  /** Manual trigger — lets the owner (or this codebase's test/demo flow) run the daily checks without waiting for the cron tick. */
  @Post('run-now')
  runNow() {
    return this.notifications.runDailyChecks();
  }
}

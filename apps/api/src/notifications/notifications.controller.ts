import { Controller, Get, Post } from '@nestjs/common';
import { OwnerContextService } from '../owner/owner-context.service.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly ownerContext: OwnerContextService,
  ) {}

  @Get('email-log')
  async listLogs() {
    return this.notifications.listLogs(await this.ownerContext.getOwnerId());
  }

  /**
   * Manual trigger — lets the owner (or this codebase's test/demo flow) run
   * the daily checks without waiting for the cron tick. Scoped to the
   * caller's own studio; only the cron runs across every studio.
   */
  @Post('run-now')
  async runNow() {
    return this.notifications.runDailyChecks(await this.ownerContext.getOwnerId());
  }
}

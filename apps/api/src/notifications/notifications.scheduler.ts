import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service.js';

/**
 * Runs in-process on a cron schedule via @nestjs/schedule — no Trigger.dev
 * or Inngest account exists, so this is the functional substitute: it works
 * today with zero external infra. It only scales to a single API instance
 * (no distributed lock), which is fine for this app's current scope; a real
 * job queue is worth reinstating if this ever runs on more than one replica.
 */
/** Named so the job can be looked up in SchedulerRegistry (unnamed jobs get a random UUID). */
export const DAILY_CHECKS_JOB = 'daily-notification-checks';

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(private readonly notifications: NotificationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: DAILY_CHECKS_JOB })
  async handleDailyChecks() {
    this.logger.log('Running scheduled daily notification checks');
    await this.notifications.runDailyChecks();
  }
}

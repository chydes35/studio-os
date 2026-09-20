import { Module } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsScheduler } from './notifications.scheduler.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [EmailService, NotificationsService, NotificationsScheduler],
  exports: [EmailService],
})
export class NotificationsModule {}

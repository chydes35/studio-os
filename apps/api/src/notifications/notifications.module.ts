import { Module } from '@nestjs/common';
import { EmailModule } from './email.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsScheduler } from './notifications.scheduler.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [EmailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsScheduler],
  exports: [EmailModule],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { JobQueueService } from './job-queue.service.js';
import { JobWorkerService } from './job-worker.service.js';

@Module({
  imports: [NotificationsModule, StorageModule],
  providers: [JobQueueService, JobWorkerService],
  exports: [JobQueueService],
})
export class JobsModule {}

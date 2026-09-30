import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { PrismaClient } from '@repo/db';
import * as Sentry from '@sentry/nestjs';
import { PRISMA } from '../db/db.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { StorageService } from '../storage/storage.service.js';
import { WatermarkService } from '../storage/watermark.service.js';
import { ClaimedJob, JobQueueService } from './job-queue.service.js';

export const DAILY_CHECKS_JOB = 'daily-notification-checks';
export const WORKER_JOB = 'background-job-worker';

@Injectable()
export class JobWorkerService {
  private readonly logger = new Logger(JobWorkerService.name);
  private polling = false;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly queue: JobQueueService,
    private readonly storage: StorageService,
    private readonly watermark: WatermarkService,
    private readonly notifications: NotificationsService,
  ) {}

  // Recheck every five minutes. If the API was down at 9am, the first tick
  // after it returns enqueues today's unique job instead of missing the day.
  @Cron('0 */5 * * * *', { name: DAILY_CHECKS_JOB })
  async scheduleDailyChecks() {
    await this.queue.enqueueDailyChecks();
  }

  /** One photo at a time by default to bound memory on a small API instance. */
  @Cron('*/10 * * * * *', { name: WORKER_JOB })
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.queue.failExpiredExhausted();
      const concurrency = Math.max(1, Math.min(2, Number(process.env.JOB_CONCURRENCY) || 1));
      await Promise.all(Array.from({ length: concurrency }, () => this.drain()));
    } catch (error) {
      this.logger.error('Background job poll failed', error);
      Sentry.captureException(error, { tags: { component: 'job-poll' } });
    } finally {
      this.polling = false;
    }
  }

  private async drain() {
    // A large shoot must not wait ten seconds between each preview. Keep a
    // bounded batch per tick while retaining the per-replica memory limit.
    for (let i = 0; i < 50; i++) {
      if (!(await this.runOne())) break;
    }
  }

  private async runOne(): Promise<boolean> {
    const job = await this.queue.claim();
    if (!job) return false;
    const heartbeat = setInterval(() => {
      void this.queue.extendLease(job).catch((error: unknown) =>
        this.logger.error(`Could not extend lease for job ${job.id}`, error),
      );
    }, 60_000);
    heartbeat.unref();
    try {
      await this.process(job);
      await this.queue.finish(job);
    } catch (error) {
      this.logger.error(`Job ${job.id} (${job.kind}) failed`, error);
      Sentry.captureException(error, { tags: { jobKind: job.kind, jobId: job.id } });
      const exhausted = await this.queue.fail(job, error);
      if (exhausted && job.kind === 'preview' && job.resourceId) {
        await this.prisma.media.updateMany({
          where: { id: job.resourceId, processingStatus: 'pending' },
          data: { processingStatus: 'failed' },
        });
      }
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }

  private async process(job: ClaimedJob) {
    if (job.kind === 'daily-checks') {
      await this.notifications.runDailyChecks();
      return;
    }
    if (job.kind !== 'preview' || !job.resourceId) throw new Error(`Unknown job: ${job.kind}`);
    const media = await this.prisma.media.findUnique({ where: { id: job.resourceId } });
    if (!media?.r2Key || media.storageProvider !== 'R2') throw new Error('Original photo no longer exists');
    if (media.processingStatus === 'ready') return;

    const original = await this.storage.getObjectBuffer(media.r2Key);
    const watermarked = await this.watermark.applyWatermark(original);
    const previewKey = this.storage.previewKey(media.galleryId, media.id);
    await this.storage.putObjectBuffer(previewKey, watermarked, 'image/jpeg');
    await this.prisma.media.update({
      where: { id: media.id },
      data: { previewR2Key: previewKey, processingStatus: 'ready' },
    });
  }
}

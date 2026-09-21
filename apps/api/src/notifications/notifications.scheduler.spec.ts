import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PRISMA } from '../db/db.module.js';
import { OwnerModule } from '../owner/owner.module.js';
import { NotificationsModule } from './notifications.module.js';
import { DAILY_CHECKS_JOB } from './notifications.scheduler.js';

@Global()
@Module({ providers: [{ provide: PRISMA, useValue: {} }], exports: [PRISMA] })
class FakeDbModule {}

describe('NotificationsScheduler', () => {
  // Regression: NotificationsService once injected the request-scoped
  // OwnerContextService, which made the scheduler request-scoped too, and
  // @nestjs/schedule only logs a warning (no error) and skips the @Cron —
  // so the daily reminders silently never ran.
  it('registers the daily cron job (scheduler stays a static provider)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ScheduleModule.forRoot(),
        FakeDbModule,
        OwnerModule,
        NotificationsModule,
      ],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    try {
      expect(app.get(SchedulerRegistry).getCronJobs().has(DAILY_CHECKS_JOB)).toBe(true);
    } finally {
      await app.close();
    }
  });
});

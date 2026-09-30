import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { PrismaClient } from '@repo/db';
import { PRISMA } from '../src/db/db.module.js';
import { JobQueueService } from '../src/jobs/job-queue.service.js';
import { WORKER_JOB } from '../src/jobs/job-worker.service.js';
import { Actor, createTestApp } from './helpers.js';

describe('durable work across API replicas', () => {
  let first: NestExpressApplication;
  let second: NestExpressApplication;
  let db: PrismaClient;

  beforeAll(async () => {
    first = await createTestApp();
    second = await createTestApp();
    db = first.get<PrismaClient>(PRISMA);
    // This spec drives claims itself. Keep the cron from claiming a fixture
    // between its insert and the two concurrent calls below.
    await first.get(SchedulerRegistry).getCronJob(WORKER_JOB).stop();
    await second.get(SchedulerRegistry).getCronJob(WORKER_JOB).stop();
    // The shared disposable DB can contain a fixture left by an earlier
    // intentionally failing mutation run; leave the rows but retire them.
    await db.backgroundJob.updateMany({
      where: { kind: 'test', status: { not: 'done' } },
      data: { status: 'done', lockToken: null, lockedUntil: null },
    });
  });
  afterAll(async () => {
    await first.close();
    await second.close();
  });

  it('two workers claim distinct jobs and a crashed worker loses its lease', async () => {
    const keys = [`test:${randomUUID()}`, `test:${randomUUID()}`];
    for (const key of keys) {
      await db.backgroundJob.create({
        data: { key, kind: 'test', availableAt: new Date('2000-01-01T00:00:00Z') },
      });
    }

    const [a, b] = await Promise.all([
      first.get(JobQueueService).claim(),
      second.get(JobQueueService).claim(),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);
    expect([a!.id, b!.id].sort()).toEqual(
      (await db.backgroundJob.findMany({ where: { key: { in: keys } } })).map((j) => j.id).sort(),
    );

    // The second replica must not steal a live lease. Expire one as if its
    // process died, then it must be claimable with a new token and attempt.
    await db.backgroundJob.update({
      where: { id: a!.id },
      data: { lockedUntil: new Date('2000-01-01T00:00:00Z') },
    });
    const recovered = await second.get(JobQueueService).claim();
    expect(recovered?.id).toBe(a!.id);
    expect(recovered?.lockToken).not.toBe(a!.lockToken);
    expect(recovered?.attempts).toBe(2);

    // A late completion from the dead worker cannot mark the new owner's job done.
    expect((await first.get(JobQueueService).finish(a!)).count).toBe(0);
    expect((await second.get(JobQueueService).finish(recovered!)).count).toBe(1);
    expect((await second.get(JobQueueService).finish(b!)).count).toBe(1);
  });

  it('marks a preview failed when its final worker dies, so the owner can retry it', async () => {
    const owner = await Actor.register(first, 'worker-crash');
    const client = await owner.post('/clients').send({ name: 'Crash test', email: `crash-${randomUUID()}@e2e.test` });
    const booking = await owner.post('/bookings').send({ clientId: client.body.id, shootType: 'Portrait' });
    const gallery = await owner.post(`/bookings/${booking.body.id}/gallery`).send({ password: 'secret1' });
    const media = await db.media.create({
      data: {
        galleryId: gallery.body.id, type: 'PHOTO', storageProvider: 'R2',
        r2Key: `originals/${gallery.body.id}/missing.jpg`, processingStatus: 'pending',
      },
    });
    const job = await db.backgroundJob.create({
      data: {
        key: `preview:${media.id}`, kind: 'preview', resourceId: media.id,
        status: 'running', attempts: 5, lockToken: randomUUID(),
        lockedUntil: new Date('2000-01-01T00:00:00Z'),
      },
    });

    await first.get(JobQueueService).failExpiredExhausted();
    expect((await db.backgroundJob.findUnique({ where: { id: job.id } }))?.status).toBe('failed');
    expect((await db.media.findUnique({ where: { id: media.id } }))?.processingStatus).toBe('failed');
  });
});

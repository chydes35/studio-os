import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import { PRISMA } from '../db/db.module.js';

export type ClaimedJob = {
  id: string;
  kind: string;
  resourceId: string | null;
  attempts: number;
  lockToken: string;
};

const MAX_ATTEMPTS = 5;

/** One schedule per studio for now; per-owner schedules can use the same key pattern later. */
export function dailyChecksKey(now: Date, timeZone: string): string | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  if (Number(value('hour')) < 9) return null;
  return `daily-checks:${value('year')}-${value('month')}-${value('day')}`;
}

@Injectable()
export class JobQueueService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** The unique key survives retries and concurrent completion requests. */
  async enqueuePreview(mediaId: string) {
    const key = `preview:${mediaId}`;
    const existing = await this.prisma.backgroundJob.findUnique({ where: { key } });
    if (existing?.status === 'failed') {
      return this.prisma.backgroundJob.update({
        where: { key },
        data: {
          status: 'pending', attempts: 0, availableAt: new Date(),
          lockedUntil: null, lockToken: null, lastError: null,
        },
      });
    }
    return this.prisma.backgroundJob.upsert({
      where: { key },
      create: { key, kind: 'preview', resourceId: mediaId },
      update: {},
    });
  }

  async enqueueDailyChecks() {
    const key = dailyChecksKey(new Date(), process.env.NOTIFICATION_TIME_ZONE || 'America/Chicago');
    if (!key) return null;
    return this.prisma.backgroundJob.upsert({
      where: { key },
      create: { key, kind: 'daily-checks' },
      update: {},
    });
  }

  /** Claim one job in a short transaction. Its lease is extended while work runs. */
  async claim(): Promise<ClaimedJob | null> {
    const token = randomUUID();
    const jobs = await this.prisma.$queryRaw<ClaimedJob[]>`
      WITH next AS (
        SELECT id FROM "BackgroundJob"
        WHERE attempts < ${MAX_ATTEMPTS}
          AND ((status = 'pending' AND "availableAt" <= NOW())
            OR (status = 'running' AND "lockedUntil" < NOW()))
        ORDER BY CASE WHEN kind = 'daily-checks' THEN 0 ELSE 1 END,
                 "availableAt", "createdAt"
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE "BackgroundJob" AS job
      SET status = 'running', attempts = attempts + 1,
          "lockedUntil" = NOW() + INTERVAL '10 minutes',
          "lockToken" = ${token}, "updatedAt" = NOW()
      WHERE job.id = (SELECT id FROM next)
      RETURNING job.id, job.kind, job."resourceId", job.attempts, job."lockToken"
    `;
    return jobs[0] ?? null;
  }

  async extendLease(job: ClaimedJob) {
    return this.prisma.backgroundJob.updateMany({
      where: { id: job.id, status: 'running', lockToken: job.lockToken },
      data: { lockedUntil: new Date(Date.now() + 10 * 60_000) },
    });
  }

  async finish(job: ClaimedJob) {
    return this.prisma.backgroundJob.updateMany({
      where: { id: job.id, status: 'running', lockToken: job.lockToken },
      data: { status: 'done', lockedUntil: null, lockToken: null, lastError: null },
    });
  }

  async fail(job: ClaimedJob, error: unknown): Promise<boolean> {
    const exhausted = job.attempts >= MAX_ATTEMPTS;
    const updated = await this.prisma.backgroundJob.updateMany({
      where: { id: job.id, status: 'running', lockToken: job.lockToken },
      data: {
        status: exhausted ? 'failed' : 'pending',
        availableAt: new Date(Date.now() + Math.min(60_000 * 2 ** job.attempts, 30 * 60_000)),
        lockedUntil: null,
        lockToken: null,
        lastError: String(error).slice(0, 1000),
      },
    });
    return exhausted && updated.count === 1;
  }

  async failExpiredExhausted() {
    const expired = await this.prisma.backgroundJob.findMany({
      where: { status: 'running', attempts: { gte: MAX_ATTEMPTS }, lockedUntil: { lt: new Date() } },
    });
    for (const job of expired) {
      const result = await this.prisma.backgroundJob.updateMany({
        where: { id: job.id, status: 'running', lockToken: job.lockToken },
        data: { status: 'failed', lockToken: null, lockedUntil: null, lastError: 'Worker lease expired after final attempt' },
      });
      if (result.count === 1 && job.kind === 'preview' && job.resourceId) {
        await this.prisma.media.updateMany({
          where: { id: job.resourceId, processingStatus: 'pending' },
          data: { processingStatus: 'failed' },
        });
      }
    }
  }
}

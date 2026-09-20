import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';

interface Interval {
  start: Date;
  end: Date;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function parseTimeOnDate(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return result;
}

@Injectable()
export class SlotsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
  ) {}

  async getAvailableSlots(dateStr: string, durationMins: number) {
    const ownerId = await this.ownerContext.getOwnerId();
    const date = new Date(`${dateStr}T00:00:00`);
    const dayOfWeek = date.getDay();
    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [rules, bookings, blocks] = await Promise.all([
      this.prisma.availabilityRule.findMany({ where: { ownerId, dayOfWeek } }),
      this.prisma.booking.findMany({
        where: {
          ownerId,
          scheduledAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.prisma.calendarBlock.findMany({
        where: {
          ownerId,
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
      }),
    ]);

    if (rules.length === 0) return [];

    const busy: Interval[] = [
      ...bookings
        .filter((b) => b.scheduledAt)
        .map((b): Interval => {
          const start = new Date(b.scheduledAt as Date);
          const end = new Date(start);
          end.setMinutes(end.getMinutes() + (b.durationMins ?? 60));
          return { start, end };
        }),
      ...blocks.map((b): Interval => ({ start: b.startsAt, end: b.endsAt })),
    ];

    const now = new Date();
    const slots: string[] = [];

    for (const rule of rules) {
      const windowStart = parseTimeOnDate(date, rule.startTime);
      const windowEnd = parseTimeOnDate(date, rule.endTime);

      let cursor = new Date(windowStart);
      while (true) {
        const slotEnd = new Date(cursor);
        slotEnd.setMinutes(slotEnd.getMinutes() + durationMins);
        if (slotEnd > windowEnd) break;

        const bufferedInterval: Interval = {
          start: new Date(cursor.getTime() - rule.bufferMinutes * 60_000),
          end: new Date(slotEnd.getTime() + rule.bufferMinutes * 60_000),
        };
        const isBusy = busy.some((b) => overlaps(bufferedInterval, b));
        const isPast = cursor <= now;

        if (!isBusy && !isPast) {
          slots.push(cursor.toISOString());
        }

        cursor = slotEnd;
      }
    }

    return slots.sort();
  }
}

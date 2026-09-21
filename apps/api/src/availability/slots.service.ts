import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@repo/db';
import type { AvailableSlotsResponse } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { addDays, dayOfWeek, zonedWallTimeToUtc } from './zoned-time.js';

interface Interval {
  start: Date;
  end: Date;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Either the root client or an interactive-transaction client. */
type Db = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class SlotsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Only ever called from the public booking portal (no logged-in owner on
   * that request), so `ownerId` is an explicit parameter resolved by the
   * caller from the portal's URL, not from OwnerContextService.
   *
   * `dateStr` and every rule's HH:MM are wall-clock times in the *owner's*
   * time zone (User.timezone), never the server's. Pass `db` to run the
   * reads inside a caller's transaction (see BookingsService).
   */
  async getAvailableSlots(
    ownerId: string,
    dateStr: string,
    durationMins: number,
    db: Db = this.prisma,
  ): Promise<AvailableSlotsResponse> {
    const owner = await db.user.findUnique({
      where: { id: ownerId },
      select: { timezone: true },
    });
    if (!owner) throw new NotFoundException('Booking page not found');
    const { timezone } = owner;

    const dayStart = zonedWallTimeToUtc(dateStr, '00:00', timezone);
    const dayEnd = zonedWallTimeToUtc(addDays(dateStr, 1), '00:00', timezone);

    // Busy intervals are fetched with a day of margin on each side: a booking
    // that starts late the previous evening can run into this day, and a
    // rule's buffer can extend a candidate slot past either day boundary.
    const [rules, bookings, blocks] = await Promise.all([
      db.availabilityRule.findMany({ where: { ownerId, dayOfWeek: dayOfWeek(dateStr) } }),
      db.booking.findMany({
        where: {
          ownerId,
          scheduledAt: {
            gte: new Date(dayStart.getTime() - DAY_MS),
            lt: new Date(dayEnd.getTime() + DAY_MS),
          },
        },
      }),
      db.calendarBlock.findMany({
        where: {
          ownerId,
          startsAt: { lt: new Date(dayEnd.getTime() + DAY_MS) },
          endsAt: { gt: new Date(dayStart.getTime() - DAY_MS) },
        },
      }),
    ]);

    if (rules.length === 0) return { timezone, slots: [] };

    const busy: Interval[] = [
      ...bookings
        .filter((b) => b.scheduledAt)
        .map((b): Interval => {
          const start = b.scheduledAt as Date;
          return { start, end: new Date(start.getTime() + (b.durationMins ?? 60) * 60_000) };
        }),
      ...blocks.map((b): Interval => ({ start: b.startsAt, end: b.endsAt })),
    ];

    const now = new Date();
    const slots: string[] = [];

    for (const rule of rules) {
      const windowStart = zonedWallTimeToUtc(dateStr, rule.startTime, timezone);
      const windowEnd = zonedWallTimeToUtc(dateStr, rule.endTime, timezone);

      let cursor = windowStart;
      while (true) {
        const slotEnd = new Date(cursor.getTime() + durationMins * 60_000);
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

    return { timezone, slots: slots.sort() };
  }
}

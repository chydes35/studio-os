import type { PrismaClient } from '@repo/db';
import { SlotsService } from './slots.service.js';

type Rule = { dayOfWeek: number; startTime: string; endTime: string; bufferMinutes: number };
type Booking = { scheduledAt: Date; durationMins: number | null };

function service(opts: { timezone: string; rules: Rule[]; bookings?: Booking[] }) {
  const db = {
    user: { findUnique: async () => ({ timezone: opts.timezone }) },
    availabilityRule: {
      findMany: async ({ where }: { where: { dayOfWeek: number } }) =>
        opts.rules.filter((r) => r.dayOfWeek === where.dayOfWeek),
    },
    booking: { findMany: async () => opts.bookings ?? [] },
    calendarBlock: { findMany: async () => [] },
  };
  return new SlotsService(db as unknown as PrismaClient);
}

// 2026-09-28 is a Monday (dayOfWeek 1). The service hides slots already in the
// past, so the clock is pinned before it; without that this spec silently
// started failing the day after the hard-coded date went by.
const MONDAY = '2026-09-28';

describe('SlotsService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes slots in the studio's zone, independent of the server's", async () => {
    const slots = service({
      timezone: 'America/Chicago',
      rules: [{ dayOfWeek: 1, startTime: '17:00', endTime: '21:00', bufferMinutes: 0 }],
    });

    const result = await slots.getAvailableSlots('owner', MONDAY, 60);

    // 5pm–8pm CDT (UTC-5): the 7pm and 8pm slots fall on the next UTC day.
    expect(result).toEqual({
      timezone: 'America/Chicago',
      slots: [
        '2026-09-28T22:00:00.000Z',
        '2026-09-28T23:00:00.000Z',
        '2026-09-29T00:00:00.000Z',
        '2026-09-29T01:00:00.000Z',
      ],
    });
  });

  it('treats a booking that started the previous evening as busy', async () => {
    // Sunday 11pm Chicago booking for 3h runs until 2am Monday.
    const slots = service({
      timezone: 'America/Chicago',
      rules: [{ dayOfWeek: 1, startTime: '00:00', endTime: '04:00', bufferMinutes: 0 }],
      bookings: [{ scheduledAt: new Date('2026-09-28T04:00:00Z'), durationMins: 180 }],
    });

    const { slots: result } = await slots.getAvailableSlots('owner', MONDAY, 60);

    // Only 2am and 3am Chicago (07:00Z, 08:00Z) are free.
    expect(result).toEqual(['2026-09-28T07:00:00.000Z', '2026-09-28T08:00:00.000Z']);
  });
});

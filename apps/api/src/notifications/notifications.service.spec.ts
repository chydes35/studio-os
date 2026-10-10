import type { PrismaClient } from '@repo/db';
import type { EmailService } from './email.service.js';
import { NotificationsService } from './notifications.service.js';

describe('shoot reminders use the studio calendar day', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T14:00:00Z')); // 9am Chicago
  });
  afterEach(() => vi.useRealTimers());

  it('reminds for October 2 in Chicago, not for an October 2 UTC instant that is October 1 there', async () => {
    const makeBooking = (id: string, at: string) => ({
      id, ownerId: 'owner', shootType: 'Portrait',
      scheduledAt: new Date(at),
      client: { name: 'Client', email: `${id}@e2e.test` },
      owner: { timezone: 'America/Chicago' },
    });
    const send = vi.fn(async (_params: { to: string; subject: string; html: string }) => ({ delivered: false }));
    const create = vi.fn(async () => ({}));
    const db = {
      booking: { findMany: vi.fn(async () => [
        makeBooking('wrong-day', '2026-10-02T01:00:00Z'),
        makeBooking('correct-day', '2026-10-02T16:00:00Z'),
      ]) },
      invoice: { findMany: vi.fn(async () => []) },
      equipment: { findMany: vi.fn(async () => []) },
      emailLog: { findFirst: vi.fn(async () => null), create },
    };
    const service = new NotificationsService(db as unknown as PrismaClient, { send } as unknown as EmailService);

    const result = await service.runDailyChecks('owner');
    expect(result.remindersSent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].to).toBe('correct-day@e2e.test');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('only reminds confirmed (BOOKED) shoots, never an unaccepted inquiry', async () => {
    const findMany = vi.fn(async (_args: { where: { stage?: unknown } }) => []);
    const db = {
      booking: { findMany },
      invoice: { findMany: vi.fn(async () => []) },
      equipment: { findMany: vi.fn(async () => []) },
      emailLog: { findFirst: vi.fn(async () => null), create: vi.fn() },
    };
    const service = new NotificationsService(
      db as unknown as PrismaClient,
      { send: vi.fn() } as unknown as EmailService,
    );

    await service.runDailyChecks('owner');
    expect(findMany.mock.calls[0]?.[0].where.stage).toBe('BOOKED');
  });
});

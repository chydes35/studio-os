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
    const send = vi.fn(
      async (_params: { to: string; subject: string; html: string }) => ({
        delivered: false,
      }),
    );
    const create = vi.fn(async () => ({}));
    const db = {
      booking: {
        findMany: vi.fn(async () => [
          makeBooking('wrong-day', '2026-10-02T01:00:00Z'),
          makeBooking('correct-day', '2026-10-02T16:00:00Z'),
        ]),
      },
      invoice: { findMany: vi.fn(async () => []) },
      equipment: { findMany: vi.fn(async () => []) },
      emailLog: { findFirst: vi.fn(async () => null), create },
    };
    const service = new NotificationsService(
      db as unknown as PrismaClient,
      { send, isConfigured: () => true } as unknown as EmailService,
    );

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
      { send: vi.fn(), isConfigured: () => true } as unknown as EmailService,
    );

    await service.runDailyChecks('owner');
    expect(findMany.mock.calls[0]?.[0].where.stage).toBe('BOOKED');
  });
});

describe('failed and unconfigured reminders can recover', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T14:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  function fixture(configured = true) {
    const logs: { status: string }[] = [];
    const provider = { configured };
    const send = vi.fn(async () => ({
      delivered: true,
      error: undefined as string | undefined,
    }));
    const db = {
      booking: {
        findMany: vi.fn(async () => [
          {
            id: 'booking',
            ownerId: 'owner',
            shootType: 'Portrait',
            scheduledAt: new Date('2026-10-02T16:00:00Z'),
            client: { name: 'Pat', email: 'pat@e2e.test' },
            owner: { timezone: 'America/Chicago' },
          },
        ]),
      },
      invoice: { findMany: vi.fn(async () => []) },
      equipment: { findMany: vi.fn(async () => []) },
      emailLog: {
        findFirst: vi.fn(
          async ({
            where,
          }: {
            where: { status?: string | { in: string[] } };
          }) =>
            logs.find(
              (log) =>
                !where.status ||
                (typeof where.status === 'string'
                  ? log.status === where.status
                  : where.status.in.includes(log.status)),
            ) ?? null,
        ),
        create: vi.fn(async ({ data }: { data: { status: string } }) => {
          logs.push(data);
          return data;
        }),
      },
    };
    return {
      logs,
      send,
      provider,
      service: new NotificationsService(
        db as unknown as PrismaClient,
        {
          send,
          isConfigured: () => provider.configured,
        } as unknown as EmailService,
      ),
    };
  }

  it('records a rejected email as failed, allows a retry, then deduplicates success', async () => {
    const { logs, send, service } = fixture();
    send.mockResolvedValueOnce({ delivered: false, error: 'validation_error' });
    await service.runDailyChecks('owner');
    await service.runDailyChecks('owner');
    await service.runDailyChecks('owner');
    expect(send).toHaveBeenCalledTimes(2);
    expect(logs.map((log) => log.status)).toEqual(['failed', 'sent']);
  });

  it('does not repeat unconfigured logs, but retries once the provider is configured', async () => {
    const { logs, send, service, provider } = fixture(false);
    send.mockResolvedValueOnce({ delivered: false, error: 'not_configured' });
    await service.runDailyChecks('owner');
    await service.runDailyChecks('owner');
    expect(send).toHaveBeenCalledTimes(1);
    provider.configured = true;
    await service.runDailyChecks('owner');
    expect(send).toHaveBeenCalledTimes(2);
    expect(logs.map((log) => log.status)).toEqual([
      'skipped_not_configured',
      'sent',
    ]);
  });
});

import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { SlotsService } from '../availability/slots.service.js';
import type { OwnerContextService } from '../owner/owner-context.service.js';
import { ExpensesService } from '../payments/expenses.service.js';
import { BookingsService } from './bookings.service.js';

const OWNER = 'owner_a';
const ownerContext = { getOwnerId: async () => OWNER } as OwnerContextService;

/** Rows owned by OWNER; anything else simulates another studio's id. */
function fakePrisma() {
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    user: { findUnique: vi.fn(async () => ({ id: OWNER, timezone: 'UTC' })) },
    client: { findFirst: vi.fn(async ({ where }) => owned('client_a', where)) },
    location: { findFirst: vi.fn(async ({ where }) => owned('location_a', where)) },
    booking: {
      findFirst: vi.fn(async ({ where }) => owned('booking_a', where)),
      create: vi.fn(async ({ data }) => ({ id: 'new_booking', ...data })),
      update: vi.fn(async ({ data }) => ({ id: 'booking_a', ...data })),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (run) => run(tx)),
  };
  const owned = (id: string, where: { id: string; ownerId: string }) =>
    where.id === id && where.ownerId === OWNER ? { id, ownerId: OWNER } : null;
  return { ...prisma, expense: { create: vi.fn(async ({ data }) => ({ id: 'new_expense', ...data })) } };
}

describe('BookingsService.create — tenant isolation', () => {
  function setup() {
    const prisma = fakePrisma();
    const service = new BookingsService(
      prisma as unknown as PrismaClient,
      ownerContext,
      {} as SlotsService,
    );
    return { prisma, service };
  }

  it("creates a booking for the owner's own client and location", async () => {
    const { prisma, service } = setup();
    await service.create({ clientId: 'client_a', locationId: 'location_a', shootType: 'x' });
    expect(prisma.booking.create).toHaveBeenCalledOnce();
  });

  it("rejects another studio's client", async () => {
    const { prisma, service } = setup();
    await expect(service.create({ clientId: 'client_b', shootType: 'x' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it("rejects another studio's location", async () => {
    const { prisma, service } = setup();
    await expect(
      service.create({ clientId: 'client_a', locationId: 'location_b', shootType: 'x' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });
});

describe('ExpensesService.create — tenant isolation', () => {
  it("rejects another studio's booking, allows own or none", async () => {
    const prisma = fakePrisma();
    const service = new ExpensesService(prisma as unknown as PrismaClient, ownerContext);

    await expect(
      service.create({ description: 'x', amountCents: 100, bookingId: 'booking_b' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.expense.create).not.toHaveBeenCalled();

    await service.create({ description: 'x', amountCents: 100, bookingId: 'booking_a' });
    await service.create({ description: 'x', amountCents: 100 });
    expect(prisma.expense.create).toHaveBeenCalledTimes(2);
  });
});

describe('BookingsService.createPublicRequest — existing client records', () => {
  const SLOT = new Date('2026-09-28T15:00:00.000Z');
  const EXISTING = {
    id: 'client_existing',
    ownerId: OWNER,
    email: 'avery@example.com',
    name: 'Avery Chen',
    phone: null as string | null,
  };

  function setup(existing: typeof EXISTING | null) {
    const tx = {
      $executeRaw: vi.fn(async () => 0),
      client: {
        findUnique: vi.fn(async () => existing),
        create: vi.fn(async ({ data }) => ({ id: 'client_new', ...data })),
        update: vi.fn(async ({ data }) => ({ ...existing, ...data })),
      },
      booking: { create: vi.fn(async ({ data }) => ({ id: 'booking_new', ...data })) },
    };
    const prisma = {
      user: { findUnique: async () => ({ id: OWNER, timezone: 'UTC' }) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const slots = {
      getAvailableSlots: async () => ({ timezone: 'UTC', slots: [SLOT.toISOString()] }),
    } as unknown as SlotsService;
    const service = new BookingsService(prisma as unknown as PrismaClient, ownerContext, slots);
    return { tx, service };
  }

  const request = (overrides: Record<string, unknown> = {}) => ({
    clientName: 'Avery Chen',
    clientEmail: 'avery@example.com',
    shootType: 'Portrait',
    scheduledAt: SLOT,
    durationMins: 60,
    ...overrides,
  });

  it('creates a new client when the email is unknown', async () => {
    const { tx, service } = setup(null);
    const confirmation = await service.createPublicRequest(OWNER, request({ clientPhone: '555-0100' }));
    expect(tx.client.create).toHaveBeenCalledOnce();
    expect(tx.booking.create.mock.calls[0]![0].data.clientId).toBe('client_new');
    expect(confirmation).toEqual({
      id: 'booking_new',
      shootType: 'Portrait',
      stage: 'INQUIRY',
      scheduledAt: SLOT,
      durationMins: 60,
    });
    expect(confirmation).not.toHaveProperty('client');
    expect(confirmation).not.toHaveProperty('clientId');
    expect(confirmation).not.toHaveProperty('ownerId');
  });

  it("never renames an existing client, and notes the submitted name on the booking", async () => {
    const { tx, service } = setup({ ...EXISTING, phone: '555-0100' });
    await service.createPublicRequest(
      OWNER,
      request({ clientName: 'Someone Else', clientPhone: '555-9999', notes: 'hi' }),
    );

    expect(tx.client.update).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
    const { data } = tx.booking.create.mock.calls[0]![0];
    expect(data.clientId).toBe('client_existing');
    expect(data.notes).toContain('name "Someone Else"');
    expect(data.notes).toContain('phone "555-9999"');
    expect(data.notes).toMatch(/hi$/);
  });

  it('does not modify an existing client even when its phone number is missing', async () => {
    const { tx, service } = setup(EXISTING);
    await service.createPublicRequest(OWNER, request({ clientPhone: '555-0100' }));

    expect(tx.client.update).not.toHaveBeenCalled();
    expect(tx.booking.create.mock.calls[0]![0].data.notes).toContain('phone "555-0100"');
  });
});

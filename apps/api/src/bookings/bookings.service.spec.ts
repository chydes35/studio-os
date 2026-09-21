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
  const owned = (id: string, where: { id: string; ownerId: string }) =>
    where.id === id && where.ownerId === OWNER ? { id, ownerId: OWNER } : null;
  return {
    client: { findFirst: vi.fn(async ({ where }) => owned('client_a', where)) },
    location: { findFirst: vi.fn(async ({ where }) => owned('location_a', where)) },
    booking: {
      findFirst: vi.fn(async ({ where }) => owned('booking_a', where)),
      create: vi.fn(async ({ data }) => ({ id: 'new_booking', ...data })),
    },
    expense: { create: vi.fn(async ({ data }) => ({ id: 'new_expense', ...data })) },
  };
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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@repo/db';
import type { OwnerContextService } from '../owner/owner-context.service.js';
import type { StripeService } from './stripe.service.js';
import { InvoicesService } from './invoices.service.js';

const INVOICE = {
  id: 'inv_1',
  status: 'SENT',
  lineItems: [{ quantity: 1, unitAmountCents: 35_000 }],
  payments: [] as { amountCents: number }[],
};

function setup(createPayment: () => Promise<unknown>) {
  const prisma = {
    invoice: {
      findUnique: vi.fn(async () => INVOICE),
      findUniqueOrThrow: vi.fn(async () => INVOICE),
      update: vi.fn(async () => INVOICE),
    },
    payment: { create: vi.fn(createPayment) },
  };
  const service = new InvoicesService(
    prisma as unknown as PrismaClient,
    {} as OwnerContextService,
    {} as StripeService,
    {} as ConfigService,
  );
  return { prisma, service };
}

describe('InvoicesService.handleCheckoutCompleted — Stripe retries', () => {
  it('records the payment on the first delivery', async () => {
    const { prisma, service } = setup(async () => ({ id: 'pay_1' }));
    await service.handleCheckoutCompleted('inv_1', 35_000, 'pi_123');

    expect(prisma.payment.create).toHaveBeenCalledOnce();
    expect(prisma.invoice.update).toHaveBeenCalledOnce(); // status recomputed
  });

  it('ignores a redelivery of the same charge instead of double-recording it', async () => {
    const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const { prisma, service } = setup(async () => {
      throw duplicate;
    });

    await expect(service.handleCheckoutCompleted('inv_1', 35_000, 'pi_123')).resolves.toBeUndefined();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('propagates errors that are not duplicates', async () => {
    const { service } = setup(async () => {
      throw new Error('connection lost');
    });
    await expect(service.handleCheckoutCompleted('inv_1', 35_000, 'pi_123')).rejects.toThrow(
      'connection lost',
    );
  });

  it('refuses an event with no charge id, since it cannot be deduplicated', async () => {
    const { service } = setup(async () => ({ id: 'pay_1' }));
    await expect(service.handleCheckoutCompleted('inv_1', 35_000, '')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an unknown invoice id from event metadata', async () => {
    const { prisma, service } = setup(async () => ({ id: 'pay_1' }));
    prisma.invoice.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.handleCheckoutCompleted('inv_missing', 1, 'pi_9')).rejects.toThrow(
      NotFoundException,
    );
  });
});

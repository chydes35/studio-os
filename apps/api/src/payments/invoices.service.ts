import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, PrismaClient } from '@repo/db';
import type { CreateInvoiceDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';
import { StripeService } from './stripe.service.js';

const INVOICE_WITH_DETAILS = {
  include: { lineItems: true, payments: true },
} satisfies Prisma.InvoiceDefaultArgs;

type InvoiceWithDetails = Prisma.InvoiceGetPayload<typeof INVOICE_WITH_DETAILS>;

function computeTotals(invoice: InvoiceWithDetails) {
  const totalCents = invoice.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitAmountCents,
    0,
  );
  const paidCents = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
  return { totalCents, paidCents, balanceCents: totalCents - paidCents };
}

/** Prisma's unique-constraint error, without importing the runtime enum. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  async createForBooking(bookingId: string, dto: CreateInvoiceDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ownerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const invoice = await this.prisma.invoice.create({
      data: {
        bookingId,
        dueAt: dto.dueAt,
        lineItems: { create: dto.lineItems },
      },
      ...INVOICE_WITH_DETAILS,
    });
    return { ...invoice, ...computeTotals(invoice) };
  }

  async listForBookingOwnerView(bookingId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ownerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const invoices = await this.prisma.invoice.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      ...INVOICE_WITH_DETAILS,
    });
    return invoices.map((inv) => ({ ...inv, ...computeTotals(inv) }));
  }

  async listOpenForOwner() {
    const ownerId = await this.ownerContext.getOwnerId();
    const invoices = await this.prisma.invoice.findMany({
      where: {
        booking: { ownerId },
        status: { in: ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      include: {
        lineItems: true,
        payments: true,
        booking: {
          select: {
            id: true,
            shootType: true,
            client: { select: { name: true } },
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 10,
    });
    return invoices
      .map((invoice) => ({ ...invoice, ...computeTotals(invoice) }))
      .filter((invoice) => invoice.balanceCents > 0);
  }

  async markSent(id: string) {
    const invoice = await this.findOwned(id);
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only a draft invoice can be sent');
    }
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'SENT' },
      ...INVOICE_WITH_DETAILS,
    });
    return { ...updated, ...computeTotals(updated) };
  }

  async markPaid(id: string, amountCents: number) {
    await this.findOwned(id);
    await this.prisma.payment.create({
      data: { invoiceId: id, amountCents, method: 'manual' },
    });
    return this.recomputeStatus(id);
  }

  async getPublicView(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      ...INVOICE_WITH_DETAILS,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return {
      id: invoice.id,
      status: invoice.status,
      dueAt: invoice.dueAt,
      lineItems: invoice.lineItems,
      stripeConfigured: this.stripe.isConfigured(),
      ...computeTotals(invoice),
    };
  }

  async createCheckoutSession(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      ...INVOICE_WITH_DETAILS,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const { balanceCents } = computeTotals(invoice);
    if (balanceCents <= 0) {
      throw new BadRequestException('This invoice is already paid in full');
    }

    const webAppUrl = this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
    return this.stripe.createCheckoutSession({
      invoiceId: invoice.id,
      amountCents: balanceCents,
      description: `Invoice ${invoice.id}`,
      successUrl: `${webAppUrl}/invoices/${invoice.id}?paid=1`,
      cancelUrl: `${webAppUrl}/invoices/${invoice.id}`,
    });
  }

  /**
   * Stripe retries webhook deliveries (and can send the same event more than
   * once), so this must be idempotent: without it, a retry recorded a second
   * Payment for the same charge and could mark an invoice PAID on half the
   * money. `Payment.stripeChargeId` is unique, so a repeat insert is
   * rejected by the database and treated as already-handled.
   */
  async handleCheckoutCompleted(invoiceId: string, amountCents: number, stripeChargeId: string) {
    if (!stripeChargeId) {
      throw new BadRequestException('Stripe event has no payment identifier to deduplicate on');
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    try {
      await this.prisma.payment.create({
        data: { invoiceId, amountCents, method: 'stripe_card', stripeChargeId },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.logger.log(`Ignoring duplicate Stripe payment ${stripeChargeId}`);
        return;
      }
      throw err;
    }

    await this.recomputeStatus(invoiceId);
  }

  private async recomputeStatus(id: string) {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id },
      ...INVOICE_WITH_DETAILS,
    });
    const totals = computeTotals(invoice);
    const status = totals.balanceCents <= 0 ? 'PAID' : 'PARTIALLY_PAID';
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status },
      ...INVOICE_WITH_DETAILS,
    });
    return { ...updated, ...computeTotals(updated) };
  }

  private async findOwned(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, booking: { ownerId } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }
}

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { InvoicesService } from './invoices.service.js';
import type { StripeService } from './stripe.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';

function setup(type: string, paymentStatus: string) {
  const event = {
    type,
    data: {
      object: {
        payment_status: paymentStatus,
        metadata: { invoiceId: 'inv_1' },
        amount_total: 35_000,
        payment_intent: 'pi_123',
      },
    },
  };
  const stripe = { constructWebhookEvent: vi.fn(() => event) } as unknown as StripeService;
  const handleCheckoutCompleted = vi.fn(async () => undefined);
  const invoices = { handleCheckoutCompleted } as unknown as InvoicesService;
  const controller = new StripeWebhookController(stripe, invoices);
  const req = { rawBody: Buffer.from('{}') } as RawBodyRequest<Request>;
  return { run: () => controller.handleWebhook(req, 'sig'), handleCheckoutCompleted };
}

describe('Stripe webhook records a payment only when money has moved', () => {
  it('ignores a completed Checkout whose delayed payment has not cleared', async () => {
    const { run, handleCheckoutCompleted } = setup('checkout.session.completed', 'unpaid');
    await expect(run()).resolves.toEqual({ received: true });
    expect(handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it('records a card payment that is paid at completion', async () => {
    const { run, handleCheckoutCompleted } = setup('checkout.session.completed', 'paid');
    await run();
    expect(handleCheckoutCompleted).toHaveBeenCalledWith('inv_1', 35_000, 'pi_123');
  });

  it('records a delayed payment once it succeeds', async () => {
    const { run, handleCheckoutCompleted } = setup('checkout.session.async_payment_succeeded', 'paid');
    await run();
    expect(handleCheckoutCompleted).toHaveBeenCalledWith('inv_1', 35_000, 'pi_123');
  });
});
